import type { SQLOutputValue } from "node:sqlite";
import type {
  AssetVariant,
  CanvasEdge,
  CanvasMutation,
  CanvasNode,
  CanvasNodeType,
  CanvasNodeData,
  CanvasViewport,
  CanvasWorkflow,
  PipelineAsset,
  PipelineAssetType,
  PipelineProject,
  PipelineStageStatus,
  StoryboardFrame,
} from "@/server/domain/pipeline";
import type { PipelineRepository } from "@/server/ports/pipeline-repository";
import { SqliteDatabase } from "./sqlite-database";

type SqliteRow = Record<string, SQLOutputValue>;

function parseJson<T>(value: SQLOutputValue): T | null {
  if (value == null) return null;
  return JSON.parse(value as string) as T;
}

function toJson(value: unknown): string {
  return JSON.stringify(value);
}

function randomId(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

export class SqlitePipelineRepository implements PipelineRepository {
  constructor(private readonly database: SqliteDatabase) {}

  async createProject(input: Omit<PipelineProject, "createdAt" | "updatedAt">): Promise<PipelineProject> {
    const ts = nowIso();
    const project: PipelineProject = { ...input, createdAt: ts, updatedAt: ts };
    this.database.prepare(
      "INSERT INTO pipeline_projects(id, workspace_id, title, original_text, art_direction_json, model_settings_json, prompt_config_json, status, cover_artifact_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      project.id, project.rootPath, project.title, project.originalText,
      project.artDirection ? toJson(project.artDirection) : null,
      project.modelSettings ? toJson(project.modelSettings) : null,
      project.promptConfig ? toJson(project.promptConfig) : null,
      project.status, project.coverArtifactId, project.createdAt, project.updatedAt,
    );
    return project;
  }

  async openProject(): Promise<PipelineProject> {
    throw new Error("Opening a project directory requires the local Pipeline repository");
  }

  async getProjectRoot(projectId: string): Promise<string | null> {
    return (await this.getProject(projectId))?.rootPath ?? null;
  }

  async getProject(id: string): Promise<PipelineProject | null> {
    const row = this.database.prepare("SELECT * FROM pipeline_projects WHERE id = ?").get(id);
    return row ? projectFromRow(row as SqliteRow) : null;
  }

  async listProjects(): Promise<PipelineProject[]> {
    const rows = this.database.prepare("SELECT * FROM pipeline_projects ORDER BY updated_at DESC").all() as SqliteRow[];
    return rows.map(projectFromRow);
  }

  async updateProject(id: string, patch: Partial<PipelineProject>): Promise<PipelineProject | null> {
    const existing = await this.getProject(id);
    if (!existing) return null;
    const updated: PipelineProject = { ...existing, ...patch, updatedAt: nowIso() };
    this.database.prepare(
      "UPDATE pipeline_projects SET title = ?, original_text = ?, art_direction_json = ?, model_settings_json = ?, prompt_config_json = ?, status = ?, cover_artifact_id = ?, updated_at = ? WHERE id = ?",
    ).run(
      updated.title, updated.originalText,
      updated.artDirection ? toJson(updated.artDirection) : null,
      updated.modelSettings ? toJson(updated.modelSettings) : null,
      updated.promptConfig ? toJson(updated.promptConfig) : null,
      updated.status, updated.coverArtifactId, updated.updatedAt, id,
    );
    return updated;
  }

  async deleteProject(id: string): Promise<boolean> {
    return this.database.prepare("DELETE FROM pipeline_projects WHERE id = ?").run(id).changes > 0;
  }

  async createAsset(input: Omit<PipelineAsset, "createdAt" | "updatedAt">): Promise<PipelineAsset> {
    const ts = nowIso();
    const asset: PipelineAsset = { ...input, createdAt: ts, updatedAt: ts };
    this.database.prepare(
      "INSERT INTO pipeline_assets(id, project_id, type, name, description, attributes_json, selected_artifact_id, locked, starred, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      asset.id, asset.projectId, asset.type, asset.name, asset.description,
      asset.attributes ? toJson(asset.attributes) : null,
      asset.selectedArtifactId, asset.locked ? 1 : 0, asset.starred ? 1 : 0,
      asset.status, asset.createdAt, asset.updatedAt,
    );
    return asset;
  }

  async getAsset(id: string): Promise<PipelineAsset | null> {
    const row = this.database.prepare("SELECT * FROM pipeline_assets WHERE id = ?").get(id);
    return row ? assetFromRow(row as SqliteRow) : null;
  }

  async listAssets(projectId: string, type?: PipelineAssetType): Promise<PipelineAsset[]> {
    const rows = type
      ? this.database.prepare("SELECT * FROM pipeline_assets WHERE project_id = ? AND type = ? ORDER BY created_at ASC").all(projectId, type) as SqliteRow[]
      : this.database.prepare("SELECT * FROM pipeline_assets WHERE project_id = ? ORDER BY type, created_at ASC").all(projectId) as SqliteRow[];
    return rows.map(assetFromRow);
  }

  async updateAsset(id: string, patch: Partial<PipelineAsset>): Promise<PipelineAsset | null> {
    const existing = await this.getAsset(id);
    if (!existing) return null;
    const updated: PipelineAsset = { ...existing, ...patch, updatedAt: nowIso() };
    this.database.prepare(
      "UPDATE pipeline_assets SET name = ?, description = ?, attributes_json = ?, selected_artifact_id = ?, locked = ?, starred = ?, status = ?, updated_at = ? WHERE id = ?",
    ).run(
      updated.name, updated.description,
      updated.attributes ? toJson(updated.attributes) : null,
      updated.selectedArtifactId, updated.locked ? 1 : 0, updated.starred ? 1 : 0,
      updated.status, updated.updatedAt, id,
    );
    return updated;
  }

  async deleteAsset(id: string): Promise<boolean> {
    return this.database.prepare("DELETE FROM pipeline_assets WHERE id = ?").run(id).changes > 0;
  }

  async addVariant(input: Omit<AssetVariant, "createdAt">): Promise<AssetVariant> {
    const variant: AssetVariant = { ...input, createdAt: nowIso() };
    this.database.prepare(
      "INSERT INTO pipeline_asset_variants(id, asset_id, artifact_id, run_id, prompt, is_favorited, is_uploaded_source, upload_type, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    ).run(
      variant.id, variant.assetId, variant.artifactId, variant.runId, variant.prompt,
      variant.isFavorited ? 1 : 0, variant.isUploadedSource ? 1 : 0, variant.uploadType,
      variant.createdAt,
    );
    return variant;
  }

  async listVariants(assetId: string): Promise<AssetVariant[]> {
    const rows = this.database.prepare("SELECT * FROM pipeline_asset_variants WHERE asset_id = ? ORDER BY created_at DESC").all(assetId) as SqliteRow[];
    return rows.map(variantFromRow);
  }

  async updateVariant(id: string, patch: Partial<AssetVariant>): Promise<AssetVariant | null> {
    const row = this.database.prepare("SELECT * FROM pipeline_asset_variants WHERE id = ?").get(id) as SqliteRow | undefined;
    if (!row) return null;
    const updated = { ...variantFromRow(row), ...patch };
    this.database.prepare(
      "UPDATE pipeline_asset_variants SET artifact_id = ?, run_id = ?, prompt = ?, is_favorited = ?, is_uploaded_source = ?, upload_type = ? WHERE id = ?",
    ).run(
      updated.artifactId, updated.runId, updated.prompt,
      updated.isFavorited ? 1 : 0, updated.isUploadedSource ? 1 : 0,
      updated.uploadType, id,
    );
    return updated;
  }

  async updateVariantByRunId(runId: string, patch: Partial<AssetVariant>): Promise<AssetVariant | null> {
    const row = this.database.prepare("SELECT * FROM pipeline_asset_variants WHERE run_id = ?").get(runId) as SqliteRow | undefined;
    if (!row) return null;
    return this.updateVariant(row.id as string, patch);
  }

  async deleteVariant(id: string): Promise<boolean> {
    return this.database.prepare("DELETE FROM pipeline_asset_variants WHERE id = ?").run(id).changes > 0;
  }

  async createFrame(input: Omit<StoryboardFrame, "createdAt" | "updatedAt">): Promise<StoryboardFrame> {
    const ts = nowIso();
    const frame: StoryboardFrame = { ...input, createdAt: ts, updatedAt: ts };
    this.database.prepare(
      "INSERT INTO pipeline_frames(id, project_id, scene_id, character_ids_json, prop_ids_json, frame_index, visual_description, dialogue_structured_json, camera_movement_json, blocking_json, lighting_json, audio_note_json, shot_size, transition_hint, image_prompt, video_prompt, selected_image_artifact_id, final_take_run_id, locked, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      frame.id, frame.projectId, frame.sceneId, toJson(frame.characterIds), toJson(frame.propIds),
      frame.index, frame.visualDescription,
      frame.dialogueStructured ? toJson(frame.dialogueStructured) : null,
      frame.cameraMovement ? toJson(frame.cameraMovement) : null,
      frame.blocking ? toJson(frame.blocking) : null,
      frame.lighting ? toJson(frame.lighting) : null,
      frame.audioNote ? toJson(frame.audioNote) : null,
      frame.shotSize, frame.transitionHint, frame.imagePrompt, frame.videoPrompt,
      frame.selectedImageArtifactId, frame.finalTakeRunId,
      frame.locked ? 1 : 0, frame.status, frame.createdAt, frame.updatedAt,
    );
    return frame;
  }

  async getFrame(id: string): Promise<StoryboardFrame | null> {
    const row = this.database.prepare("SELECT * FROM pipeline_frames WHERE id = ?").get(id);
    return row ? frameFromRow(row as SqliteRow) : null;
  }

  async listFrames(projectId: string): Promise<StoryboardFrame[]> {
    const rows = this.database.prepare("SELECT * FROM pipeline_frames WHERE project_id = ? ORDER BY frame_index ASC").all(projectId) as SqliteRow[];
    return rows.map(frameFromRow);
  }

  async updateFrame(id: string, patch: Partial<StoryboardFrame>): Promise<StoryboardFrame | null> {
    const existing = await this.getFrame(id);
    if (!existing) return null;
    const updated: StoryboardFrame = { ...existing, ...patch, updatedAt: nowIso() };
    this.database.prepare(
      "UPDATE pipeline_frames SET scene_id = ?, character_ids_json = ?, prop_ids_json = ?, frame_index = ?, visual_description = ?, dialogue_structured_json = ?, camera_movement_json = ?, blocking_json = ?, lighting_json = ?, audio_note_json = ?, shot_size = ?, transition_hint = ?, image_prompt = ?, video_prompt = ?, selected_image_artifact_id = ?, final_take_run_id = ?, locked = ?, status = ?, updated_at = ? WHERE id = ?",
    ).run(
      updated.sceneId, toJson(updated.characterIds), toJson(updated.propIds),
      updated.index, updated.visualDescription,
      updated.dialogueStructured ? toJson(updated.dialogueStructured) : null,
      updated.cameraMovement ? toJson(updated.cameraMovement) : null,
      updated.blocking ? toJson(updated.blocking) : null,
      updated.lighting ? toJson(updated.lighting) : null,
      updated.audioNote ? toJson(updated.audioNote) : null,
      updated.shotSize, updated.transitionHint, updated.imagePrompt, updated.videoPrompt,
      updated.selectedImageArtifactId, updated.finalTakeRunId,
      updated.locked ? 1 : 0, updated.status, updated.updatedAt, id,
    );
    return updated;
  }

  async deleteFrame(id: string): Promise<boolean> {
    return this.database.prepare("DELETE FROM pipeline_frames WHERE id = ?").run(id).changes > 0;
  }

  async reorderFrames(projectId: string, frameIds: string[]): Promise<void> {
    this.database.transaction(() => {
      const stmt = this.database.prepare("UPDATE pipeline_frames SET frame_index = ? WHERE id = ? AND project_id = ?");
      frameIds.forEach((id, index) => stmt.run(index, id, projectId));
    });
  }

  async createCanvasNode(input: Omit<CanvasNode, "createdAt" | "updatedAt" | "width" | "height" | "data"> & { width?: number | null; height?: number | null; data?: CanvasNodeData | null }): Promise<CanvasNode> {
    const ts = nowIso();
    const node: CanvasNode = {
      ...input,
      width: input.width ?? null,
      height: input.height ?? null,
      data: input.data ?? null,
      createdAt: ts,
      updatedAt: ts,
    };
    this.database.prepare(
      "INSERT INTO pipeline_canvas_nodes(id, project_id, type, entity_id, position_x, position_y, width, height, data_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      node.id, node.projectId, node.type, node.entityId, node.positionX, node.positionY,
      node.width, node.height, node.data ? toJson(node.data) : null, node.createdAt, node.updatedAt,
    );
    return node;
  }

  async getCanvasNode(id: string): Promise<CanvasNode | null> {
    const row = this.database.prepare("SELECT * FROM pipeline_canvas_nodes WHERE id = ?").get(id);
    return row ? canvasNodeFromRow(row as SqliteRow) : null;
  }

  async listCanvasNodes(projectId: string): Promise<CanvasNode[]> {
    const rows = this.database.prepare("SELECT * FROM pipeline_canvas_nodes WHERE project_id = ? ORDER BY created_at ASC").all(projectId) as SqliteRow[];
    return rows.map(canvasNodeFromRow);
  }

  async updateCanvasNodePosition(id: string, x: number, y: number): Promise<void> {
    this.database.prepare("UPDATE pipeline_canvas_nodes SET position_x = ?, position_y = ?, updated_at = ? WHERE id = ?").run(x, y, nowIso(), id);
  }

  async updateCanvasNode(id: string, patch: {
    positionX?: number;
    positionY?: number;
    width?: number | null;
    height?: number | null;
    data?: CanvasNodeData | null;
  }): Promise<CanvasNode | null> {
    const existing = await this.getCanvasNode(id);
    if (!existing) return null;
    const updated: CanvasNode = {
      ...existing,
      positionX: patch.positionX ?? existing.positionX,
      positionY: patch.positionY ?? existing.positionY,
      width: patch.width === undefined ? existing.width : patch.width,
      height: patch.height === undefined ? existing.height : patch.height,
      data: patch.data === undefined ? existing.data : patch.data,
      updatedAt: nowIso(),
    };
    this.database.prepare(
      "UPDATE pipeline_canvas_nodes SET position_x = ?, position_y = ?, width = ?, height = ?, data_json = ?, updated_at = ? WHERE id = ?",
    ).run(
      updated.positionX, updated.positionY, updated.width, updated.height,
      updated.data ? toJson(updated.data) : null, updated.updatedAt, id,
    );
    return updated;
  }

  async deleteCanvasNode(id: string): Promise<boolean> {
    return this.database.prepare("DELETE FROM pipeline_canvas_nodes WHERE id = ?").run(id).changes > 0;
  }

  async findCanvasNodeByEntity(projectId: string, entityType: CanvasNodeType, entityId: string): Promise<CanvasNode | null> {
    const row = this.database.prepare("SELECT * FROM pipeline_canvas_nodes WHERE project_id = ? AND type = ? AND entity_id = ?").get(projectId, entityType, entityId);
    return row ? canvasNodeFromRow(row as SqliteRow) : null;
  }

  async createCanvasEdge(input: Omit<CanvasEdge, "id" | "createdAt" | "updatedAt">): Promise<CanvasEdge> {
    const ts = nowIso();
    const edge: CanvasEdge = { ...input, id: randomId(), createdAt: ts, updatedAt: ts };
    this.database.prepare(
      "INSERT INTO pipeline_canvas_edges(id, project_id, source_node_id, target_node_id, edge_type, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
    ).run(edge.id, edge.projectId, edge.sourceNodeId, edge.targetNodeId, edge.edgeType, ts, ts);
    return edge;
  }

  async getCanvasEdge(id: string): Promise<CanvasEdge | null> {
    const row = this.database.prepare("SELECT * FROM pipeline_canvas_edges WHERE id = ?").get(id);
    return row ? canvasEdgeFromRow(row as SqliteRow) : null;
  }

  async listCanvasEdges(projectId: string): Promise<CanvasEdge[]> {
    const rows = this.database.prepare("SELECT * FROM pipeline_canvas_edges WHERE project_id = ? ORDER BY created_at ASC").all(projectId) as SqliteRow[];
    return rows.map(canvasEdgeFromRow);
  }

  async deleteCanvasEdge(id: string): Promise<boolean> {
    return this.database.prepare("DELETE FROM pipeline_canvas_edges WHERE id = ?").run(id).changes > 0;
  }

  async deleteCanvasEdgesByNode(nodeId: string): Promise<void> {
    this.database.prepare("DELETE FROM pipeline_canvas_edges WHERE source_node_id = ? OR target_node_id = ?").run(nodeId, nodeId);
  }

  async getCanvasViewport(projectId: string): Promise<CanvasViewport> {
    const row = this.database.prepare("SELECT viewport_x, viewport_y, viewport_zoom FROM pipeline_canvas_drafts WHERE project_id = ?").get(projectId) as SqliteRow | undefined;
    if (!row) return { x: 0, y: 0, zoom: 1 };
    return { x: Number(row.viewport_x), y: Number(row.viewport_y), zoom: Number(row.viewport_zoom) };
  }

  async getCanvasRevision(projectId: string): Promise<number> {
    const row = this.database.prepare("SELECT revision FROM pipeline_canvas_drafts WHERE project_id = ?").get(projectId) as SqliteRow | undefined;
    return row ? Number(row.revision) : 0;
  }

  async updateCanvasViewport(projectId: string, viewport: CanvasViewport): Promise<void> {
    this.database.prepare(`
      INSERT INTO pipeline_canvas_drafts(project_id, viewport_x, viewport_y, viewport_zoom, revision, updated_at)
      VALUES (?,?,?,?,0,?)
      ON CONFLICT(project_id) DO UPDATE SET
        viewport_x = excluded.viewport_x,
        viewport_y = excluded.viewport_y,
        viewport_zoom = excluded.viewport_zoom,
        updated_at = excluded.updated_at
    `).run(projectId, viewport.x, viewport.y, viewport.zoom, nowIso());
  }

  async applyCanvasMutationBatch(
    projectId: string,
    baseRevision: number,
    mutations: CanvasMutation[],
  ): Promise<{ applied: boolean; revision: number }> {
    return this.database.transaction(() => {
      const timestamp = nowIso();
      this.database.prepare(`
        INSERT INTO pipeline_canvas_drafts(project_id, viewport_x, viewport_y, viewport_zoom, revision, updated_at)
        VALUES (?,0,0,1,0,?)
        ON CONFLICT(project_id) DO NOTHING
      `).run(projectId, timestamp);

      const currentRow = this.database.prepare(
        "SELECT revision FROM pipeline_canvas_drafts WHERE project_id = ?",
      ).get(projectId) as SqliteRow;
      const currentRevision = Number(currentRow.revision);
      if (currentRevision !== baseRevision) {
        return { applied: false, revision: currentRevision };
      }

      for (const mutation of mutations) {
        if (mutation.type === "node.create") {
          const node = mutation.node;
          if (node.projectId !== projectId) throw new Error("Canvas node project mismatch");
          this.database.prepare(`
            INSERT INTO pipeline_canvas_nodes(
              id, project_id, type, entity_id, position_x, position_y, width, height, data_json, created_at, updated_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
          `).run(
            node.id, projectId, node.type, node.entityId, node.positionX, node.positionY,
            node.width, node.height, node.data ? toJson(node.data) : null, timestamp, timestamp,
          );
          continue;
        }

        if (mutation.type === "node.update") {
          const existing = this.database.prepare(
            "SELECT * FROM pipeline_canvas_nodes WHERE id = ? AND project_id = ?",
          ).get(mutation.nodeId, projectId) as SqliteRow | undefined;
          if (!existing) throw new Error("Canvas node was not found in this project");
          const current = canvasNodeFromRow(existing);
          const patch = mutation.patch;
          this.database.prepare(`
            UPDATE pipeline_canvas_nodes
            SET position_x = ?, position_y = ?, width = ?, height = ?, data_json = ?, updated_at = ?
            WHERE id = ? AND project_id = ?
          `).run(
            patch.positionX ?? current.positionX,
            patch.positionY ?? current.positionY,
            patch.width === undefined ? current.width : patch.width,
            patch.height === undefined ? current.height : patch.height,
            patch.data === undefined ? (current.data ? toJson(current.data) : null) : (patch.data ? toJson(patch.data) : null),
            timestamp,
            mutation.nodeId,
            projectId,
          );
          continue;
        }

        if (mutation.type === "node.delete") {
          this.database.prepare(
            "DELETE FROM pipeline_canvas_nodes WHERE id = ? AND project_id = ?",
          ).run(mutation.nodeId, projectId);
          continue;
        }

        if (mutation.type === "edge.create") {
          const edge = mutation.edge;
          if (edge.projectId !== projectId) throw new Error("Canvas edge project mismatch");
          const endpoints = this.database.prepare(`
            SELECT COUNT(*) AS count
            FROM pipeline_canvas_nodes
            WHERE project_id = ? AND id IN (?, ?)
          `).get(projectId, edge.sourceNodeId, edge.targetNodeId) as SqliteRow;
          if (Number(endpoints.count) !== 2) throw new Error("Canvas edge endpoints are invalid");
          this.database.prepare(`
            INSERT INTO pipeline_canvas_edges(
              id, project_id, source_node_id, target_node_id, edge_type, created_at, updated_at
            ) VALUES (?,?,?,?,?,?,?)
          `).run(edge.id, projectId, edge.sourceNodeId, edge.targetNodeId, edge.edgeType, timestamp, timestamp);
          continue;
        }

        if (mutation.type === "edge.delete") {
          this.database.prepare(
            "DELETE FROM pipeline_canvas_edges WHERE id = ? AND project_id = ?",
          ).run(mutation.edgeId, projectId);
          continue;
        }

        this.database.prepare(`
          UPDATE pipeline_canvas_drafts
          SET viewport_x = ?, viewport_y = ?, viewport_zoom = ?, updated_at = ?
          WHERE project_id = ?
        `).run(
          mutation.viewport.x,
          mutation.viewport.y,
          mutation.viewport.zoom,
          timestamp,
          projectId,
        );
      }

      const nextRevision = currentRevision + 1;
      this.database.prepare(`
        UPDATE pipeline_canvas_drafts
        SET revision = ?, updated_at = ?
        WHERE project_id = ? AND revision = ?
      `).run(nextRevision, timestamp, projectId, currentRevision);
      return { applied: true, revision: nextRevision };
    });
  }

  async createCanvasWorkflow(input: Omit<CanvasWorkflow, "createdAt" | "updatedAt">): Promise<CanvasWorkflow> {
    const ts = nowIso();
    const workflow: CanvasWorkflow = { ...input, createdAt: ts, updatedAt: ts };
    this.database.prepare(
      "INSERT INTO pipeline_canvas_workflows(id, project_id, name, description, template_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
    ).run(workflow.id, workflow.projectId, workflow.name, workflow.description, toJson({ nodes: workflow.nodes, edges: workflow.edges }), ts, ts);
    return workflow;
  }

  async listCanvasWorkflows(projectId: string): Promise<CanvasWorkflow[]> {
    const rows = this.database.prepare("SELECT * FROM pipeline_canvas_workflows WHERE project_id = ? ORDER BY updated_at DESC").all(projectId) as SqliteRow[];
    return rows.map(canvasWorkflowFromRow);
  }

  async getCanvasWorkflow(id: string): Promise<CanvasWorkflow | null> {
    const row = this.database.prepare("SELECT * FROM pipeline_canvas_workflows WHERE id = ?").get(id);
    return row ? canvasWorkflowFromRow(row as SqliteRow) : null;
  }

  async deleteCanvasWorkflow(id: string): Promise<boolean> {
    return this.database.prepare("DELETE FROM pipeline_canvas_workflows WHERE id = ?").run(id).changes > 0;
  }

  async getStageStatuses(projectId: string): Promise<PipelineStageStatus[]> {
    const project = await this.getProject(projectId);
    const assets = await this.listAssets(projectId);
    const frames = await this.listFrames(projectId);
    const hasText = project ? project.originalText.length > 0 : false;
    const completedAssets = assets.filter((a) => a.status === "completed").length;
    const completedFrames = frames.filter((f) => f.status === "completed").length;
    const framesWithFinalTake = frames.filter((f) => f.finalTakeRunId).length;
    return [
      { stage: "script", status: hasText ? "ready" : "idle", statusLabel: hasText ? "ready" : "idle" },
      { stage: "assets", status: assets.length === 0 ? "idle" : completedAssets === assets.length ? "ready" : "warn", statusLabel: assets.length === 0 ? "idle" : `${completedAssets}/${assets.length}` },
      { stage: "storyboard", status: frames.length === 0 ? "idle" : completedFrames === frames.length ? "ready" : "warn", statusLabel: frames.length === 0 ? "idle" : `${completedFrames}/${frames.length}` },
      { stage: "video", status: frames.length === 0 ? "gated" : framesWithFinalTake === 0 ? "idle" : framesWithFinalTake === frames.length ? "ready" : "warn", statusLabel: frames.length === 0 ? "gated" : `${framesWithFinalTake}/${frames.length}` },
      { stage: "assembly", status: project?.status === "assembled" || project?.status === "exported" ? "ready" : "gated", statusLabel: "coming soon" },
    ];
  }
}

function projectFromRow(row: SqliteRow): PipelineProject {
  return {
    id: row.id as string,
    rootPath: row.workspace_id as string,
    title: row.title as string,
    originalText: row.original_text as string,
    artDirection: parseJson(row.art_direction_json),
    modelSettings: parseJson(row.model_settings_json),
    promptConfig: parseJson(row.prompt_config_json),
    status: row.status as PipelineProject["status"],
    coverArtifactId: row.cover_artifact_id as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
function assetFromRow(row: SqliteRow): PipelineAsset {
  return {
    id: row.id as string, projectId: row.project_id as string,
    type: row.type as PipelineAssetType, name: row.name as string,
    description: row.description as string, attributes: parseJson(row.attributes_json),
    selectedArtifactId: row.selected_artifact_id as string | null,
    locked: Boolean(row.locked), starred: Boolean(row.starred),
    status: row.status as PipelineAsset["status"],
    createdAt: row.created_at as string, updatedAt: row.updated_at as string,
  };
}

function variantFromRow(row: SqliteRow): AssetVariant {
  return {
    id: row.id as string, assetId: row.asset_id as string,
    artifactId: row.artifact_id as string | null, runId: row.run_id as string | null,
    prompt: row.prompt as string, isFavorited: Boolean(row.is_favorited),
    isUploadedSource: Boolean(row.is_uploaded_source),
    uploadType: row.upload_type as string | null, createdAt: row.created_at as string,
  };
}

function frameFromRow(row: SqliteRow): StoryboardFrame {
  return {
    id: row.id as string, projectId: row.project_id as string,
    sceneId: row.scene_id as string | null,
    characterIds: parseJson(row.character_ids_json) ?? [],
    propIds: parseJson(row.prop_ids_json) ?? [],
    index: row.frame_index as number,
    visualDescription: row.visual_description as string | null,
    dialogueStructured: parseJson(row.dialogue_structured_json),
    cameraMovement: parseJson(row.camera_movement_json),
    blocking: parseJson(row.blocking_json),
    lighting: parseJson(row.lighting_json),
    audioNote: parseJson(row.audio_note_json),
    shotSize: row.shot_size as string | null,
    transitionHint: row.transition_hint as string | null,
    imagePrompt: row.image_prompt as string | null,
    videoPrompt: row.video_prompt as string | null,
    selectedImageArtifactId: row.selected_image_artifact_id as string | null,
    finalTakeRunId: row.final_take_run_id as string | null,
    locked: Boolean(row.locked), status: row.status as StoryboardFrame["status"],
    createdAt: row.created_at as string, updatedAt: row.updated_at as string,
  };
}

function canvasNodeFromRow(row: SqliteRow): CanvasNode {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    type: row.type as CanvasNodeType,
    entityId: row.entity_id as string,
    positionX: Number(row.position_x),
    positionY: Number(row.position_y),
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    data: parseJson<CanvasNodeData>(row.data_json),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function canvasEdgeFromRow(row: SqliteRow): CanvasEdge {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    sourceNodeId: row.source_node_id as string,
    targetNodeId: row.target_node_id as string,
    edgeType: row.edge_type as CanvasEdge["edgeType"],
    createdAt: row.created_at as string | undefined,
    updatedAt: row.updated_at as string | undefined,
  };
}

function canvasWorkflowFromRow(row: SqliteRow): CanvasWorkflow {
  const template = parseJson<{ nodes: CanvasWorkflow["nodes"]; edges: CanvasWorkflow["edges"] }>(row.template_json) ?? { nodes: [], edges: [] };
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    name: row.name as string,
    description: row.description as string,
    nodes: template.nodes,
    edges: template.edges,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
