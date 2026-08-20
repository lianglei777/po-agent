import { randomUUID } from "node:crypto";
import type { AudioNote, Blocking, CameraMovementData, DialogueStructured, LightingData, PipelineAsset, PipelineProject, StoryboardFrame } from "@/server/domain/pipeline";
import type { LlmPort } from "@/server/ports/llm-port";
import type { PipelineRepository } from "@/server/ports/pipeline-repository";
import type { PipelineSsePort } from "@/server/ports/pipeline-sse-port";
import { ensurePipelineRunSession } from "./pipeline-session";
import type { GenerationRunService } from "@/server/application/content-generation/generation-run-service";
import type { GenerationInputAsset } from "@/contracts/generation";
import { STORYBOARD_EXTRACTION_PROMPT, parseStoryboardJson } from "./pipeline-prompts";

export class StoryboardService {
  constructor(
    private readonly llm: LlmPort,
    private readonly repo: PipelineRepository,
    private readonly runService: GenerationRunService,
    private readonly pipelineCwd: string,
    private readonly sse?: PipelineSsePort,
  ) {}

  async extractFrames(projectId: string): Promise<StoryboardFrame[]> {
    const project = await this.repo.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    const assets = await this.repo.listAssets(projectId);
    const assetList = assets.map((a) => `${a.type}:${a.name}`).join(", ");
    const response = await this.llm.chat([
      { role: "system", content: STORYBOARD_EXTRACTION_PROMPT },
      { role: "user", content: `剧本:\n${project.originalText}\n\n已提取实体:\n${assetList}` },
    ]);
    const parsed = parseStoryboardJson(response);
    const frames: StoryboardFrame[] = [];
    const existingFrames = await this.repo.listFrames(projectId);
    let frameIndex = existingFrames.length;
    for (const f of parsed.frames) {
      const characterRefs = (f.characterRefs as string[]) ?? [];
      const propRefs = (f.propRefs as string[]) ?? [];
      const sceneRef = (f.sceneRef as string) ?? "";
      const characterIds = characterRefs
        .map((name) => assets.find((a) => a.name === name || a.name.includes(name)) as PipelineAsset | undefined)
        .filter(Boolean)
        .map((a) => a!.id);
      const propIds = propRefs
        .map((name) => assets.find((a) => a.name === name || a.name.includes(name)) as PipelineAsset | undefined)
        .filter(Boolean)
        .map((a) => a!.id);
      const sceneId = sceneRef
        ? assets.find((a) => a.type === "scene" && (a.name === sceneRef || a.name.includes(sceneRef)))?.id ?? null
        : null;
      const frame = await this.repo.createFrame({
        id: randomUUID(), projectId, sceneId, characterIds, propIds,
        index: frameIndex++,
        visualDescription: (f.visualDescription as string) ?? null,
        dialogueStructured: (f.dialogue as DialogueStructured | null) ?? null,
        cameraMovement: (f.cameraMovement as CameraMovementData | null) ?? null,
        blocking: (f.blocking as Blocking | null) ?? null,
        lighting: (f.lighting as LightingData | null) ?? null,
        audioNote: (f.audioNote as AudioNote | null) ?? null,
        shotSize: (f.shotSize as string) ?? null,
        transitionHint: (f.transitionHint as string) ?? null,
        imagePrompt: null, videoPrompt: null,
        selectedImageArtifactId: null, finalTakeRunId: null,
        locked: false, status: "pending",
      });
      frames.push(frame);
      await this.createCanvasNodeForFrame(projectId, frame, frameIndex - 1);
      await this.createCanvasEdgesForFrame(projectId, frame, characterIds, sceneId, propIds);
    }
    await this.repo.updateProject(projectId, { status: "storyboard_ready" });
    return frames;
  }

  private async createCanvasNodeForFrame(projectId: string, frame: StoryboardFrame, index: number): Promise<void> {
    const node = await this.repo.createCanvasNode({
      id: randomUUID(), projectId, type: "storyboard", entityId: frame.id,
      positionX: 700 + index * 340, positionY: 0,
    });
    this.sse?.emit({ type: "node_created", projectId, payload: node });
  }

  private async createCanvasEdgesForFrame(
    projectId: string, frame: StoryboardFrame,
    characterIds: string[], sceneId: string | null, propIds: string[],
  ): Promise<void> {
    const frameNode = await this.repo.findCanvasNodeByEntity(projectId, "storyboard", frame.id);
    if (!frameNode) return;
    for (const charId of characterIds) {
      const charNode = await this.repo.findCanvasNodeByEntity(projectId, "character", charId);
      if (charNode) {
        const edge = await this.repo.createCanvasEdge({
          projectId, sourceNodeId: frameNode.id, targetNodeId: charNode.id, edgeType: "references",
        });
        this.sse?.emit({ type: "edge_created", projectId, payload: edge });
      }
    }
    if (sceneId) {
      const sceneNode = await this.repo.findCanvasNodeByEntity(projectId, "scene", sceneId);
      if (sceneNode) {
        const edge = await this.repo.createCanvasEdge({
          projectId, sourceNodeId: frameNode.id, targetNodeId: sceneNode.id, edgeType: "references",
        });
        this.sse?.emit({ type: "edge_created", projectId, payload: edge });
      }
    }
    for (const propId of propIds) {
      const propNode = await this.repo.findCanvasNodeByEntity(projectId, "prop", propId);
      if (propNode) {
        const edge = await this.repo.createCanvasEdge({
          projectId, sourceNodeId: frameNode.id, targetNodeId: propNode.id, edgeType: "references",
        });
      this.sse?.emit({ type: "edge_created", projectId, payload: edge });
      }
    }
  }

  // 生成分镜图 (I2I) — 用角色/场景参考图做 image-to-image
  async generateFrameImage(projectId: string, frameId: string, source: "direct-ui" | "agent-tool" = "direct-ui"): Promise<string> {
    const frame = await this.repo.getFrame(frameId);
    if (!frame) throw new Error(`Frame ${frameId} not found`);
    const project = await this.repo.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    const characters = await this.repo.listAssets(projectId, "character");
    const scenes = await this.repo.listAssets(projectId, "scene");

    // 拼装 prompt
    const draftPrompt = this.assembleFramePrompt(frame, characters, scenes, project);

    // 收集参考图 (选中变体的 artifact)
    const refAssets: GenerationInputAsset[] = [];
    for (const charId of frame.characterIds) {
      const asset = characters.find((a) => a.id === charId);
      if (asset?.selectedArtifactId) {
        refAssets.push({ slot: "imageUrls", ref: { type: "artifact", artifactId: asset.selectedArtifactId } });
      }
    }
    if (frame.sceneId) {
      const scene = scenes.find((s) => s.id === frame.sceneId);
      if (scene?.selectedArtifactId) {
        refAssets.push({ slot: "imageUrls", ref: { type: "artifact", artifactId: scene.selectedArtifactId } });
      }
    }

    // 创建 GenerationRun (I2I)
    await ensurePipelineRunSession(this.runService, projectId, this.pipelineCwd);
    const runView = await this.runService.createRun({
      sessionId: `pipeline:${projectId}`,
      capability: "image-to-image",
      prompt: draftPrompt,
      assets: refAssets.length > 0 ? refAssets : undefined,
      source,
      sourceRef: `pipeline:frame:${frameId}:image`,
      idempotencyKey: `pipeline:frame:${frameId}:image:${Date.now()}`,
      parameters: {},
    });

    await this.repo.updateFrame(frameId, { status: "processing", imagePrompt: draftPrompt });
    return runView.run.id;
  }

  private assembleFramePrompt(frame: StoryboardFrame, characters: PipelineAsset[], scenes: PipelineAsset[], project: PipelineProject): string {
    const parts: string[] = [];
    if (frame.visualDescription) parts.push(frame.visualDescription);
    if (frame.lighting?.description) parts.push(frame.lighting.description);
    if (frame.cameraMovement?.description) parts.push(frame.cameraMovement.description);
    if (frame.shotSize) parts.push(frame.shotSize);
    const charDesc = frame.characterIds
      .map((id) => characters.find((c) => c.id === id))
      .filter(Boolean)
      .map((c) => `${c!.name} (${c!.description})`)
      .join(", ");
    if (charDesc) parts.push(`Characters: ${charDesc}`);
    if (frame.sceneId) {
      const scene = scenes.find((s) => s.id === frame.sceneId);
      if (scene) parts.push(`Scene: ${scene.name}, ${scene.description}`);
    }
    return parts.join(". ") + ".";
  }
}
