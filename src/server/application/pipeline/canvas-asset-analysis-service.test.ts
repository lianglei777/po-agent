import { describe, expect, it, vi } from "vitest";
import type { CanvasNode } from "@/server/domain/pipeline";
import type { CanvasAssetAnalyzer } from "@/server/ports/canvas-asset-analyzer";
import type { PipelineRepository } from "@/server/ports/pipeline-repository";
import type { CanvasMediaPreprocessor } from "@/server/ports/canvas-media-preprocessor";
import { CanvasAssetAnalysisService } from "./canvas-asset-analysis-service";

describe("CanvasAssetAnalysisService", () => {
  it("analyzes an image once and reuses the persisted result", async () => {
    const analyses = new Map<string, Awaited<ReturnType<PipelineRepository["createCanvasAssetAnalysis"]>>>();
    const node = imageNode();
    const repository = {
      getCanvasNode: vi.fn(async () => node),
      findCanvasAssetAnalysis: vi.fn(async (input) => [...analyses.values()].find((item) =>
        item.nodeId === input.nodeId && item.sourceFingerprint === input.sourceFingerprint &&
        item.modelProvider === input.modelProvider && item.modelId === input.modelId) ?? null),
      createCanvasAssetAnalysis: vi.fn(async (input) => {
        const value = { ...input, createdAt: "now" };
        analyses.set(value.id, value);
        return value;
      }),
    } as unknown as PipelineRepository;
    const canvas = { readNodeMedia: vi.fn(async () => ({
      slot: "preview", name: "reference.png", mimeType: "image/png", data: new Uint8Array([1, 2, 3]),
    })), readNodeGenerationArtifact: vi.fn() };
    const analyzer = {
      validateVisionModel: vi.fn(),
      analyzeImage: vi.fn(async () => content("red product")),
      analyzeVideoFrames: vi.fn(),
    } as unknown as CanvasAssetAnalyzer;
    const service = new CanvasAssetAnalysisService(repository, canvas, analyzer, {} as CanvasMediaPreprocessor);

    const input = { projectId: "project-1", nodeIds: [node.id], model: { provider: "test", modelId: "vision" } };
    await expect(service.inspect(input)).resolves.toMatchObject([{ cached: false, analysis: { content: { summary: "red product" } } }]);
    await expect(service.inspect(input)).resolves.toMatchObject([{ cached: true }]);
    expect(analyzer.analyzeImage).toHaveBeenCalledTimes(1);
  });

  it("analyzes a historical generation artifact without borrowing current node metadata", async () => {
    const node: CanvasNode = {
      ...imageNode(), type: "video", data: {
        type: "video", name: "镜头 2", action: "video_generate",
        videoMetadata: { durationSeconds: 12, width: 1920, height: 1080 },
      },
    };
    const repository = {
      getCanvasNode: vi.fn(async () => node),
      findCanvasAssetAnalysis: vi.fn(async () => null),
      createCanvasAssetAnalysis: vi.fn(async (input) => ({ ...input, createdAt: "now" })),
    } as unknown as PipelineRepository;
    const canvas = {
      readNodeMedia: vi.fn(),
      readNodeGenerationArtifact: vi.fn(async () => ({
        slot: "preview", name: "take-1.mp4", mimeType: "video/mp4", data: new Uint8Array([7, 8, 9]),
      })),
    };
    const analyzer = {
      validateVisionModel: vi.fn(), analyzeImage: vi.fn(),
      analyzeVideoFrames: vi.fn(async () => content("历史版本的慢推镜头")),
    } as unknown as CanvasAssetAnalyzer;
    const preprocessor = {
      sampleVideo: vi.fn(async () => ({ durationSeconds: 4, analyzedDurationSeconds: 4, frames: [
        { timestampSeconds: 0, mimeType: "image/jpeg", data: new Uint8Array([1]) },
      ] })),
    } as unknown as CanvasMediaPreprocessor;

    const [result] = await new CanvasAssetAnalysisService(repository, canvas, analyzer, preprocessor)
      .inspectGenerationArtifacts({
        projectId: "project-1",
        artifacts: [{ nodeId: node.id, runId: "run-old", artifactId: "artifact-old" }],
        model: { provider: "test", modelId: "vision" },
      });

    expect(result).toMatchObject({
      runId: "run-old", artifactId: "artifact-old",
      analysis: { nodeVersion: "generation:run-old:artifact-old", sourceName: "take-1.mp4" },
    });
    expect(preprocessor.sampleVideo).toHaveBeenCalledWith(expect.objectContaining({ durationSeconds: undefined }));
  });

  it("sends only bounded sampled video frames to the multimodal analyzer", async () => {
    const node: CanvasNode = { ...imageNode(), type: "video", data: {
      type: "video", name: "clip", action: "video_generate", videoMetadata: { durationSeconds: 4, width: 1920, height: 1080 },
    } };
    const repository = {
      getCanvasNode: vi.fn(async () => node),
      findCanvasAssetAnalysis: vi.fn(async () => null),
      createCanvasAssetAnalysis: vi.fn(async (input) => ({ ...input, createdAt: "now" })),
    } as unknown as PipelineRepository;
    const canvas = { readNodeMedia: vi.fn(async () => ({
      slot: "preview", name: "clip.mp4", mimeType: "video/mp4", data: new Uint8Array([9, 8, 7]),
    })), readNodeGenerationArtifact: vi.fn() };
    const analyzer = {
      validateVisionModel: vi.fn(),
      analyzeImage: vi.fn(),
      analyzeVideoFrames: vi.fn(async () => content("two-shot product clip")),
    } as unknown as CanvasAssetAnalyzer;
    const preprocessor = {
      sampleVideo: vi.fn(async () => ({ durationSeconds: 4, analyzedDurationSeconds: 4, frames: [
        { timestampSeconds: 0, mimeType: "image/jpeg", data: new Uint8Array([1]) },
        { timestampSeconds: 2, mimeType: "image/jpeg", data: new Uint8Array([2]) },
      ] })),
    } as unknown as CanvasMediaPreprocessor;
    const [result] = await new CanvasAssetAnalysisService(repository, canvas, analyzer, preprocessor).inspect({
      projectId: "project-1", nodeIds: [node.id], model: { provider: "test", modelId: "vision" },
    });
    expect(result?.analysis.content.technicalMetadata).toMatchObject({ durationSeconds: 4, width: 1920 });
    expect(analyzer.analyzeVideoFrames).toHaveBeenCalledWith(expect.objectContaining({
      frames: expect.arrayContaining([expect.objectContaining({ data: new Uint8Array([1]) })]),
    }));
    expect(canvas.readNodeMedia).toHaveBeenCalledTimes(1);
  });

  it("persists compact audio rhythm evidence without calling the LLM", async () => {
    const node: CanvasNode = { ...imageNode(), type: "audio", data: {
      type: "audio", name: "music", action: "audio_generate",
      audioMetadata: { durationSeconds: 6, format: "MP3", sampleRateHz: 44_100, channelCount: 2 },
    } };
    const repository = {
      getCanvasNode: vi.fn(async () => node),
      findCanvasAssetAnalysis: vi.fn(async () => null),
      createCanvasAssetAnalysis: vi.fn(async (input) => ({ ...input, createdAt: "now" })),
    } as unknown as PipelineRepository;
    const canvas = { readNodeMedia: vi.fn(async () => ({
      slot: "preview", name: "music.mp3", mimeType: "audio/mpeg", data: new Uint8Array([4, 5, 6]),
    })), readNodeGenerationArtifact: vi.fn() };
    const analyzer = { validateVisionModel: vi.fn(), analyzeImage: vi.fn(), analyzeVideoFrames: vi.fn() } as unknown as CanvasAssetAnalyzer;
    const preprocessor = { analyzeAudio: vi.fn(async () => ({
      estimatedBpm: 120, rhythm: "steady" as const, dynamics: "medium" as const,
      silenceRatio: 0.1, analyzedDurationSeconds: 6,
    })) } as unknown as CanvasMediaPreprocessor;
    const [result] = await new CanvasAssetAnalysisService(repository, canvas, analyzer, preprocessor).inspect({
      projectId: "project-1", nodeIds: [node.id], model: null,
    });
    expect(result?.analysis.content).toMatchObject({
      summary: expect.stringContaining("120 BPM"),
      technicalMetadata: { rhythm: "steady", sampleRateHz: 44_100, silenceRatio: 0.1 },
    });
    expect(analyzer.analyzeImage).not.toHaveBeenCalled();
    expect(analyzer.analyzeVideoFrames).not.toHaveBeenCalled();
  });
});

function imageNode(): CanvasNode {
  return {
    id: "image-1", projectId: "project-1", type: "image", entityId: "entity-1",
    positionX: 0, positionY: 0, width: 320, height: 320,
    data: { type: "image", name: "reference", action: "image_generate" },
    createdAt: "v1", updatedAt: "v1",
  };
}

function content(summary: string) {
  return { summary, subjects: [], composition: null, materials: [], style: null, lighting: null,
    visibleText: [], brandElements: [], suggestedRoles: [], technicalMetadata: {} };
}
