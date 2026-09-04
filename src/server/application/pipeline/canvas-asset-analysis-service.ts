import { createHash, randomUUID } from "node:crypto";
import { AppError } from "@/server/domain/app-error";
import type {
  CanvasAssetAnalysis,
  CanvasAssetAnalysisContent,
  CanvasNode,
} from "@/server/domain/pipeline";
import type { CanvasAssetAnalyzer } from "@/server/ports/canvas-asset-analyzer";
import type { CanvasMediaPreprocessor } from "@/server/ports/canvas-media-preprocessor";
import type { PipelineRepository } from "@/server/ports/pipeline-repository";
import type { CanvasStudioService } from "./canvas-studio-service";

const MAX_ASSETS_PER_CALL = 8;

export class CanvasAssetAnalysisService {
  constructor(
    private readonly repository: PipelineRepository,
    private readonly canvas: Pick<CanvasStudioService, "readNodeMedia" | "readNodeGenerationArtifact">,
    private readonly analyzer: CanvasAssetAnalyzer,
    private readonly mediaPreprocessor: CanvasMediaPreprocessor,
  ) {}

  async inspect(input: {
    projectId: string;
    nodeIds: string[];
    model: { provider: string; modelId: string } | null;
  }): Promise<Array<{ analysis: CanvasAssetAnalysis; cached: boolean }>> {
    const nodeIds = [...new Set(input.nodeIds)];
    if (!nodeIds.length || nodeIds.length > MAX_ASSETS_PER_CALL) {
      throw new AppError("VALIDATION_ERROR", `Choose 1 to ${MAX_ASSETS_PER_CALL} canvas assets to inspect`, 400);
    }
    const results = [];
    for (const nodeId of nodeIds) {
      const node = await this.requireMediaNode(input.projectId, nodeId);
      const media = await this.canvas.readNodeMedia(node.id);
      results.push(await this.inspectMedia({
        projectId: input.projectId,
        node,
        media,
        model: input.model,
        nodeVersion: node.updatedAt,
        sourceName: node.data!.workspaceFile?.name ?? media.name,
      }));
    }
    return results;
  }

  /**
   * 历史 Generation Run 的 artifact 仍归属原节点；复用同一分析缓存，
   * 但以 run/artifact 标识 nodeVersion，避免把当前节点内容误标为历史版本。
   */
  async inspectGenerationArtifacts(input: {
    projectId: string;
    artifacts: Array<{ nodeId: string; runId: string; artifactId: string }>;
    model: { provider: string; modelId: string } | null;
  }): Promise<Array<{
    nodeId: string;
    runId: string;
    artifactId: string;
    analysis: CanvasAssetAnalysis;
    cached: boolean;
  }>> {
    const artifacts = uniqueArtifactTargets(input.artifacts);
    if (!artifacts.length || artifacts.length > MAX_ASSETS_PER_CALL) {
      throw new AppError("VALIDATION_ERROR", `Choose 1 to ${MAX_ASSETS_PER_CALL} generated results to inspect`, 400);
    }
    const results = [];
    for (const target of artifacts) {
      const node = await this.requireMediaNode(input.projectId, target.nodeId);
      const media = await this.canvas.readNodeGenerationArtifact(node.id, target.runId, target.artifactId);
      const result = await this.inspectMedia({
        projectId: input.projectId,
        node,
        media,
        model: input.model,
        nodeVersion: `generation:${target.runId}:${target.artifactId}`,
        sourceName: media.name,
        // 历史 artifact 的元数据不能从当前节点借用，避免把新版本时长混入旧版本评审。
        useCurrentNodeMetadata: false,
      });
      results.push({ ...target, ...result });
    }
    return results;
  }

  private async requireMediaNode(projectId: string, nodeId: string): Promise<CanvasNode> {
    const node = await this.repository.getCanvasNode(nodeId);
    if (!node || node.projectId !== projectId) {
      throw new AppError("PIPELINE_CANVAS_NODE_NOT_FOUND", "A selected canvas asset no longer exists in this project", 404, { nodeId });
    }
    if (!node.data || node.data.type === "text") {
      throw new AppError("VALIDATION_ERROR", "Only image, video, or audio canvas nodes can be inspected", 400, { nodeId });
    }
    return node;
  }

  private async inspectMedia(input: {
    projectId: string;
    node: CanvasNode;
    media: { name: string; mimeType: string; data: Uint8Array };
    model: { provider: string; modelId: string } | null;
    nodeVersion: string;
    sourceName: string;
    useCurrentNodeMetadata?: boolean;
  }): Promise<{ analysis: CanvasAssetAnalysis; cached: boolean }> {
    const mediaType = input.node.data!.type;
    const analysisModel = mediaType === "image" || mediaType === "video" ? input.model : null;
    const fingerprint = sourceFingerprint(
      mediaType,
      input.media.data,
      input.useCurrentNodeMetadata === false ? undefined : input.node.data,
    );
    const cached = await this.repository.findCanvasAssetAnalysis({
      nodeId: input.node.id,
      sourceFingerprint: fingerprint,
      modelProvider: analysisModel?.provider ?? null,
      modelId: analysisModel?.modelId ?? null,
    });
    if (cached) return { analysis: cached, cached: true };
    const content = mediaType === "image"
      ? await this.analyzeImage(input.node, input.media, input.model)
      : mediaType === "video"
        ? await this.analyzeVideo(input.node, input.media, input.model, input.useCurrentNodeMetadata === false)
        : await this.analyzeAudio(input.node, input.media, input.useCurrentNodeMetadata === false);
    const analysis = await this.repository.createCanvasAssetAnalysis({
      id: randomUUID(),
      projectId: input.projectId,
      nodeId: input.node.id,
      nodeVersion: input.nodeVersion,
      sourceFingerprint: fingerprint,
      mediaType,
      sourceName: input.sourceName,
      contentType: input.media.mimeType,
      modelProvider: analysisModel?.provider ?? null,
      modelId: analysisModel?.modelId ?? null,
      content,
    });
    return { analysis, cached: false };
  }

  private async analyzeImage(
    node: CanvasNode,
    media: { name: string; mimeType: string; data: Uint8Array },
    model: { provider: string; modelId: string } | null,
  ): Promise<CanvasAssetAnalysisContent> {
    if (!model) {
      throw new AppError(
        "PIPELINE_AGENT_MODEL_VISION_REQUIRED",
        "Choose a vision-capable Canvas Agent model before analyzing images",
        409,
      );
    }
    if (!media.mimeType.startsWith("image/")) {
      throw new AppError("VALIDATION_ERROR", "The selected image node does not contain a supported image file", 400, { nodeId: node.id });
    }
    return this.analyzer.analyzeImage({ ...model, name: media.name, mimeType: media.mimeType, data: media.data });
  }

  private async analyzeVideo(
    node: CanvasNode,
    media: { name: string; mimeType: string; data: Uint8Array },
    model: { provider: string; modelId: string } | null,
    ignoreCurrentMetadata = false,
  ): Promise<CanvasAssetAnalysisContent> {
    if (!model) {
      throw new AppError(
        "PIPELINE_AGENT_MODEL_VISION_REQUIRED",
        "Choose a vision-capable Canvas Agent model before analyzing video frames",
        409,
      );
    }
    await this.analyzer.validateVisionModel(model);
    const sampled = await this.mediaPreprocessor.sampleVideo({
      name: media.name,
      mimeType: media.mimeType,
      data: media.data,
      durationSeconds: ignoreCurrentMetadata ? undefined : node.data?.videoMetadata?.durationSeconds,
    });
    const result = await this.analyzer.analyzeVideoFrames({ ...model, name: media.name, frames: sampled.frames });
    return {
      ...result,
      technicalMetadata: {
        contentType: media.mimeType,
        sizeBytes: media.data.byteLength,
        durationSeconds: sampled.durationSeconds,
        analyzedDurationSeconds: sampled.analyzedDurationSeconds,
        ...(ignoreCurrentMetadata ? {} : node.data?.videoMetadata ?? {}),
        ...result.technicalMetadata,
      },
    };
  }

  private async analyzeAudio(
    node: CanvasNode,
    media: { name: string; mimeType: string; data: Uint8Array },
    ignoreCurrentMetadata = false,
  ): Promise<CanvasAssetAnalysisContent> {
    const rhythm = await this.mediaPreprocessor.analyzeAudio(media);
    const bpm = rhythm.estimatedBpm ? ` Estimated tempo: ${rhythm.estimatedBpm} BPM.` : "";
    return {
      summary: `Audio rhythm is ${rhythm.rhythm} with ${rhythm.dynamics} dynamics and ${Math.round(rhythm.silenceRatio * 100)}% silence.${bpm} No speech transcription was produced.`,
      subjects: [], composition: null, materials: [], style: null, lighting: null,
      visibleText: [], brandElements: [], suggestedRoles: [],
      technicalMetadata: {
        contentType: media.mimeType,
        sizeBytes: media.data.byteLength,
        ...(ignoreCurrentMetadata ? {} : node.data?.audioMetadata ?? {}),
        rhythm: rhythm.rhythm,
        dynamics: rhythm.dynamics,
        silenceRatio: rhythm.silenceRatio,
        analyzedDurationSeconds: rhythm.analyzedDurationSeconds,
        transcriptionAvailable: false,
        ...(rhythm.estimatedBpm === null ? {} : { estimatedBpm: rhythm.estimatedBpm }),
      },
    };
  }
}

function sourceFingerprint(
  mediaType: Exclude<CanvasNode["data"], null | undefined>["type"],
  data: Uint8Array,
  nodeData?: CanvasNode["data"],
): string {
  const version = mediaType === "video" ? "video-frames-v1"
    : mediaType === "audio" ? "audio-rhythm-v1" : "image-v1";
  const hash = createHash("sha256").update(version).update(data);
  if (mediaType === "video") hash.update(JSON.stringify(nodeData?.videoMetadata ?? null));
  if (mediaType === "audio") hash.update(JSON.stringify(nodeData?.audioMetadata ?? null));
  return hash.digest("hex");
}

function uniqueArtifactTargets(input: Array<{ nodeId: string; runId: string; artifactId: string }>) {
  const seen = new Set<string>();
  return input.filter((target) => {
    const key = `${target.nodeId}:${target.runId}:${target.artifactId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
