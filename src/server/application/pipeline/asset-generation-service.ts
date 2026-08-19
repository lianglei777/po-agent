import { randomUUID } from "node:crypto";
import type { GenerationRunService } from "@/server/application/content-generation/generation-run-service";
import type { AssetVariant, PipelineAsset, PipelineProject } from "@/server/domain/pipeline";
import type { PipelineRepository } from "@/server/ports/pipeline-repository";
import type { PipelineSsePort } from "@/server/ports/pipeline-sse-port";
import { ensurePipelineRunSession } from "./pipeline-session";

export class AssetGenerationService {
  constructor(
    private readonly repo: PipelineRepository,
    private readonly runService: GenerationRunService,
    private readonly pipelineCwd: string,
    private readonly sse?: PipelineSsePort,
  ) {}

  async generateAssetImage(projectId: string, assetId: string, source: "direct-ui" | "agent-tool" = "direct-ui"): Promise<AssetVariant> {
    const asset = await this.repo.getAsset(assetId);
    if (!asset) throw new Error(`Asset ${assetId} not found`);
    if (asset.locked) throw new Error(`Asset ${assetId} is locked`);
    const project = await this.repo.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    const prompt = this.assemblePrompt(asset, project);
    await ensurePipelineRunSession(this.runService, projectId, this.pipelineCwd);
    const runView = await this.runService.createRun({
      sessionId: `pipeline:${projectId}`,
      capability: "text-to-image",
      prompt,
      source,
      sourceRef: `pipeline:asset:${assetId}`,
      idempotencyKey: `pipeline:asset:${assetId}:${Date.now()}`,
      parameters: { aspectRatio: this.resolveAspectRatio(asset, project) },
    });
    const variant = await this.repo.addVariant({
      id: randomUUID(), assetId, artifactId: null, runId: runView.run.id,
      prompt, isFavorited: false, isUploadedSource: false, uploadType: null,
    });
    await this.repo.updateAsset(assetId, { status: "processing" });
    this.sse?.emit({ type: "generation_progress", projectId, payload: { assetId, runId: runView.run.id, variantId: variant.id } });
    return variant;
  }

  async selectVariant(assetId: string, variantId: string): Promise<void> {
    const variant = (await this.repo.listVariants(assetId)).find((v) => v.id === variantId);
    if (!variant) throw new Error(`Variant ${variantId} not found`);
    await this.repo.updateAsset(assetId, { selectedArtifactId: variant.artifactId, status: "completed" });
  }

  async toggleAssetLock(assetId: string): Promise<void> {
    const asset = await this.repo.getAsset(assetId);
    if (!asset) throw new Error(`Asset ${assetId} not found`);
    await this.repo.updateAsset(assetId, { locked: !asset.locked });
  }

  private assemblePrompt(asset: PipelineAsset, project: PipelineProject): string {
    const parts: string[] = [asset.description];
    const attrs = asset.attributes as Record<string, unknown> | null;
    if (attrs) {
      if (attrs.age) parts.push(String(attrs.age));
      if (attrs.gender) parts.push(String(attrs.gender));
      if (attrs.clothing) parts.push(String(attrs.clothing));
      if (attrs.timeOfDay) parts.push(String(attrs.timeOfDay));
      if (attrs.lightingMood) parts.push(String(attrs.lightingMood));
    }
    return parts.join(", ");
  }

  private resolveAspectRatio(asset: PipelineAsset, project: PipelineProject): string {
    const s = project.modelSettings as { characterAspectRatio?: string; sceneAspectRatio?: string } | null;
    if (!s) return "9:16";
    if (asset.type === "character") return s.characterAspectRatio ?? "9:16";
    if (asset.type === "scene") return s.sceneAspectRatio ?? "16:9";
    return "1:1";
  }
}
