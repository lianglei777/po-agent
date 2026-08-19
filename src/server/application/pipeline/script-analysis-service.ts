import { randomUUID } from "node:crypto";
import type { LlmPort } from "@/server/ports/llm-port";
import type { PipelineRepository } from "@/server/ports/pipeline-repository";
import type { PipelineSsePort } from "@/server/ports/pipeline-sse-port";
import type { PipelineAsset, PipelineAssetType } from "@/server/domain/pipeline";
import { ENTITY_EXTRACTION_PROMPT, parseEntityJson } from "./pipeline-prompts";

export class ScriptAnalysisService {
  constructor(
    private readonly llm: LlmPort,
    private readonly repo: PipelineRepository,
    private readonly sse?: PipelineSsePort,
  ) {}

  async extractEntities(projectId: string): Promise<PipelineAsset[]> {
    const project = await this.repo.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    const response = await this.llm.chat([
      { role: "system", content: ENTITY_EXTRACTION_PROMPT },
      { role: "user", content: project.originalText },
    ]);
    const parsed = parseEntityJson(response);
    const assets: PipelineAsset[] = [];
    for (const char of parsed.characters) {
      const asset = await this.repo.createAsset({
        id: randomUUID(), projectId, type: "character" as PipelineAssetType,
        name: char.name, description: char.description,
        attributes: { age: char.age, gender: char.gender, clothing: char.clothing, visualWeight: char.visualWeight ?? 3, persona: char.persona },
        selectedArtifactId: null, locked: false, starred: false, status: "pending",
      });
      assets.push(asset);
      await this.createCanvasNodeForAsset(projectId, asset);
    }
    for (const scene of parsed.scenes) {
      const asset = await this.repo.createAsset({
        id: randomUUID(), projectId, type: "scene" as PipelineAssetType,
        name: scene.name, description: scene.description,
        attributes: { timeOfDay: scene.timeOfDay, lightingMood: scene.lightingMood },
        selectedArtifactId: null, locked: false, starred: false, status: "pending",
      });
      assets.push(asset);
      await this.createCanvasNodeForAsset(projectId, asset);
    }
    for (const prop of parsed.props) {
      const asset = await this.repo.createAsset({
        id: randomUUID(), projectId, type: "prop" as PipelineAssetType,
        name: prop.name, description: prop.description, attributes: null,
        selectedArtifactId: null, locked: false, starred: false, status: "pending",
      });
      assets.push(asset);
      await this.createCanvasNodeForAsset(projectId, asset);
    }
    await this.repo.updateProject(projectId, { status: "assets_ready" });
    return assets;
  }

  private async createCanvasNodeForAsset(projectId: string, asset: PipelineAsset): Promise<void> {
    const existingNodes = await this.repo.listCanvasNodes(projectId);
    const sameTypeCount = existingNodes.filter((n) => n.type === asset.type).length;
    const positions: Record<string, { x: number; y: number }> = {
      character: { x: 0, y: 250 + sameTypeCount * 220 },
      scene: { x: 220, y: 250 + sameTypeCount * 260 },
      prop: { x: 500, y: 250 + sameTypeCount * 160 },
    };
    const pos = positions[asset.type] ?? { x: 0, y: 0 };
    const node = await this.repo.createCanvasNode({
      id: randomUUID(), projectId, type: asset.type, entityId: asset.id,
      positionX: pos.x, positionY: pos.y,
    });
    this.sse?.emit({ type: "node_created", projectId, payload: node });
  }
}
