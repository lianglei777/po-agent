import { randomUUID } from "node:crypto";
import type { GenerationRunService } from "@/server/application/content-generation/generation-run-service";
import type { PipelineRepository } from "@/server/ports/pipeline-repository";
import type { PipelineSsePort } from "@/server/ports/pipeline-sse-port";
import { ensurePipelineRunSession } from "./pipeline-session";
import type { GenerationInputAsset } from "@/contracts/generation";

export class VideoGenerationService {
  constructor(
    private readonly repo: PipelineRepository,
    private readonly runService: GenerationRunService,
    private readonly pipelineCwd: string,
    private readonly sse?: PipelineSsePort,
  ) {}

  async generateI2V(projectId: string, frameId: string, source: "direct-ui" | "agent-tool" = "direct-ui"): Promise<string> {
    const frame = await this.repo.getFrame(frameId);
    if (!frame) throw new Error(`Frame ${frameId} not found`);
    if (!frame.selectedImageArtifactId) throw new Error(`Frame ${frameId} has no selected image`);
    const prompt = frame.videoPrompt || frame.imagePrompt || frame.visualDescription || "";
    const assets: GenerationInputAsset[] = [
      { slot: "firstFrameUrl", ref: { type: "artifact", artifactId: frame.selectedImageArtifactId } },
    ];
    await ensurePipelineRunSession(this.runService, projectId, this.pipelineCwd);
    const runView = await this.runService.createRun({
      sessionId: `pipeline:${projectId}`, capability: "image-to-video", prompt, assets, source,
      sourceRef: `pipeline:frame:${frameId}:i2v`, idempotencyKey: `pipeline:frame:${frameId}:i2v:${Date.now()}`,
      parameters: { durationSeconds: 5 },
    });
    await this.repo.updateFrame(frameId, { status: "processing" });
    await this.createVideoNodeAndEdge(projectId, frameId, runView.run.id);
    return runView.run.id;
  }

  async generateR2V(projectId: string, frameId: string, source: "direct-ui" | "agent-tool" = "direct-ui"): Promise<string> {
    const frame = await this.repo.getFrame(frameId);
    if (!frame) throw new Error(`Frame ${frameId} not found`);
    const refAssets: GenerationInputAsset[] = [];
    for (const charId of frame.characterIds) {
      const asset = await this.repo.getAsset(charId);
      if (asset?.selectedArtifactId) refAssets.push({ slot: "imageUrls", ref: { type: "artifact", artifactId: asset.selectedArtifactId } });
    }
    if (frame.sceneId) {
      const scene = await this.repo.getAsset(frame.sceneId);
      if (scene?.selectedArtifactId) refAssets.push({ slot: "imageUrls", ref: { type: "artifact", artifactId: scene.selectedArtifactId } });
    }
    const prompt = frame.videoPrompt || frame.visualDescription || "";
    await ensurePipelineRunSession(this.runService, projectId, this.pipelineCwd);
    const runView = await this.runService.createRun({
      sessionId: `pipeline:${projectId}`, capability: "multimodal-to-video", prompt,
      assets: refAssets.length > 0 ? refAssets : undefined, source,
      sourceRef: `pipeline:frame:${frameId}:r2v`, idempotencyKey: `pipeline:frame:${frameId}:r2v:${Date.now()}`,
      parameters: { durationSeconds: 5 },
    });
    await this.repo.updateFrame(frameId, { status: "processing" });
    await this.createVideoNodeAndEdge(projectId, frameId, runView.run.id);
    return runView.run.id;
  }

  async selectFinalTake(frameId: string, runId: string): Promise<void> {
    await this.repo.updateFrame(frameId, { finalTakeRunId: runId, status: "completed" });
  }

  private async createVideoNodeAndEdge(projectId: string, frameId: string, runId: string): Promise<void> {
    const existingNodes = await this.repo.listCanvasNodes(projectId);
    const videoCount = existingNodes.filter((n) => n.type === "video").length;
    const frameNode = await this.repo.findCanvasNodeByEntity(projectId, "storyboard", frameId);
    const node = await this.repo.createCanvasNode({
      id: randomUUID(), projectId, type: "video", entityId: runId,
      positionX: 1100 + videoCount * 220, positionY: 0,
    });
    this.sse?.emit({ type: "node_created", projectId, payload: node });
    if (frameNode) {
      const edge = await this.repo.createCanvasEdge({ projectId, sourceNodeId: frameNode.id, targetNodeId: node.id, edgeType: "references" });
      this.sse?.emit({ type: "edge_created", projectId, payload: edge });
    }
  }
}
