import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  AssetVariant,
  CanvasEdge,
  CanvasMutation,
  CanvasNode,
  CanvasNodeData,
  CanvasNodeType,
  CanvasViewport,
  CanvasWorkflow,
  PipelineAsset,
  PipelineAgentConversation,
  CanvasAssetAnalysis,
  CanvasContinuityBible,
  PipelineAssetType,
  PipelineProject,
  PipelineStageStatus,
  StoryboardFrame,
} from "@/server/domain/pipeline";
import { AppError } from "@/server/domain/app-error";
import type { WorkspaceRootProvider } from "@/server/ports/file-system";
import type { PipelineProjectRegistry } from "@/server/ports/pipeline-project-registry";
import type { PipelineRepository } from "@/server/ports/pipeline-repository";
import { SqliteDatabase } from "@/server/infrastructure/sqlite/sqlite-database";
import { SqlitePipelineRepository } from "@/server/infrastructure/sqlite/sqlite-pipeline-repository";

const FORMAT = "po-agent-pipeline-project";
const FORMAT_VERSION = 1;
const METADATA_DIRECTORY = ".pipeline-studio";
const MANIFEST_NAME = "project.json";
const DATABASE_NAME = "project.sqlite";

type ProjectManifest = {
  format: typeof FORMAT;
  formatVersion: typeof FORMAT_VERSION;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

type OpenProject = {
  rootPath: string;
  database: SqliteDatabase;
  repository: SqlitePipelineRepository;
};

/**
 * Pipeline 项目目录是内容事实来源；全局 registry 只保存最近打开路径。
 * 适配器继续暴露现有 PipelineRepository，避免业务服务感知 SQLite 文件位置。
 */
export class LocalPipelineRepository implements PipelineRepository {
  private readonly opened = new Map<string, OpenProject>();

  constructor(
    private readonly registry: PipelineProjectRegistry,
    private readonly roots: WorkspaceRootProvider,
  ) {}

  async createProject(input: Omit<PipelineProject, "createdAt" | "updatedAt">): Promise<PipelineProject> {
    const rootPath = await prepareNewProjectRoot(input.rootPath);
    let opened: OpenProject | null = null;
    try {
      await createProjectDirectories(rootPath);
      opened = this.openDatabase(input.id, rootPath);
      const project = await opened.repository.createProject({ ...input, rootPath: "." });
      await writeManifest(rootPath, {
        format: FORMAT,
        formatVersion: FORMAT_VERSION,
        projectId: input.id,
        title: input.title,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      });
      await this.registry.upsert({ projectId: input.id, rootPath, lastOpenedAt: new Date().toISOString() });
      this.roots.addRoot(rootPath);
      return { ...project, rootPath };
    } catch (error) {
      opened?.database.close();
      this.opened.delete(input.id);
      // 仅清理由本次调用刚创建且已通过父目录约束的项目根目录。
      await fs.rm(rootPath, { recursive: true, force: true });
      throw error;
    }
  }

  async openProject(rootPath: string): Promise<PipelineProject> {
    const resolved = await resolveExistingDirectory(rootPath);
    const manifest = await readManifest(resolved);
    await requireProjectDatabase(resolved);
    const alreadyOpened = this.opened.get(manifest.projectId);
    if (alreadyOpened && pathKey(alreadyOpened.rootPath) !== pathKey(resolved)) {
      alreadyOpened.database.close();
      this.opened.delete(manifest.projectId);
    }
    const opened = this.opened.get(manifest.projectId) ?? this.openDatabase(manifest.projectId, resolved);
    const stored = await opened.repository.getProject(manifest.projectId);
    if (!stored) {
      opened.database.close();
      this.opened.delete(manifest.projectId);
      throw new AppError("VALIDATION_ERROR", "The selected folder does not contain a valid Pipeline Studio database", 400);
    }
    await this.registry.upsert({ projectId: manifest.projectId, rootPath: resolved, lastOpenedAt: new Date().toISOString() });
    this.roots.addRoot(resolved);
    return { ...stored, rootPath: resolved };
  }

  async getProjectRoot(projectId: string): Promise<string | null> {
    return (await this.registry.get(projectId))?.rootPath ?? null;
  }

  async getProject(id: string): Promise<PipelineProject | null> {
    const located = await this.forProject(id);
    if (!located) return null;
    const project = await located.repository.getProject(id);
    return project ? { ...project, rootPath: located.rootPath } : null;
  }

  async listProjects(): Promise<PipelineProject[]> {
    const registrations = await this.registry.list();
    const projects = await Promise.all(registrations.map(async (registration) => {
      try {
        return await this.getProject(registration.projectId);
      } catch {
        // 路径失效的项目保留在索引中，重新选择目录后可恢复；首页只展示当前可访问项目。
        return null;
      }
    }));
    return projects
      .filter((project): project is PipelineProject => project !== null)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async updateProject(id: string, patch: Partial<PipelineProject>): Promise<PipelineProject | null> {
    const located = await this.forProject(id);
    if (!located) return null;
    const updated = await located.repository.updateProject(id, { ...patch, rootPath: "." });
    if (!updated) return null;
    const manifest = await readManifest(located.rootPath);
    await writeManifest(located.rootPath, { ...manifest, title: updated.title, updatedAt: updated.updatedAt });
    return { ...updated, rootPath: located.rootPath };
  }

  async deleteProject(id: string): Promise<boolean> {
    const opened = this.opened.get(id);
    opened?.database.close();
    this.opened.delete(id);
    // “删除”在本地项目模型中仅从首页移除，绝不隐式删除用户目录。
    return this.registry.remove(id);
  }

  async getAgentConversation(projectId: string) {
    return (await this.requireProject(projectId)).repository.getAgentConversation(projectId);
  }

  async findAgentConversationBySessionId(sessionId: string) {
    return (await this.find((repository) => repository.findAgentConversationBySessionId(sessionId)))?.value ?? null;
  }

  async upsertAgentConversation(input: Omit<PipelineAgentConversation, "createdAt" | "updatedAt">) {
    return (await this.requireProject(input.projectId)).repository.upsertAgentConversation(input);
  }

  async updateAgentConversation(
    projectId: string,
    patch: Partial<Pick<PipelineAgentConversation, "provider" | "modelId" | "allowAgentGeneration">>,
  ) {
    return (await this.requireProject(projectId)).repository.updateAgentConversation(projectId, patch);
  }

  async createCanvasAgentPlan(input: Parameters<PipelineRepository["createCanvasAgentPlan"]>[0]) {
    return (await this.requireProject(input.projectId)).repository.createCanvasAgentPlan(input);
  }

  async getCanvasAgentPlan(id: string) {
    return (await this.find((repository) => repository.getCanvasAgentPlan(id)))?.value ?? null;
  }

  async updateCanvasAgentPlan(id: string, patch: Parameters<PipelineRepository["updateCanvasAgentPlan"]>[1]) {
    const owner = await this.find((repository) => repository.getCanvasAgentPlan(id));
    return owner ? owner.repository.updateCanvasAgentPlan(id, patch) : null;
  }

  async createCanvasAgentAction(input: Parameters<PipelineRepository["createCanvasAgentAction"]>[0]) {
    return (await this.requireProject(input.projectId)).repository.createCanvasAgentAction(input);
  }

  async getCanvasAgentAction(id: string) {
    return (await this.find((repository) => repository.getCanvasAgentAction(id)))?.value ?? null;
  }

  async updateCanvasAgentAction(id: string, patch: Parameters<PipelineRepository["updateCanvasAgentAction"]>[1]) {
    const owner = await this.find((repository) => repository.getCanvasAgentAction(id));
    return owner ? owner.repository.updateCanvasAgentAction(id, patch) : null;
  }

  async createCanvasAssetAnalysis(input: Omit<CanvasAssetAnalysis, "createdAt">) {
    return (await this.requireProject(input.projectId)).repository.createCanvasAssetAnalysis(input);
  }

  async findCanvasAssetAnalysis(input: Parameters<PipelineRepository["findCanvasAssetAnalysis"]>[0]) {
    return (await this.find((repository) => repository.findCanvasAssetAnalysis(input)))?.value ?? null;
  }

  async getCanvasAssetAnalysis(id: string) {
    return (await this.find((repository) => repository.getCanvasAssetAnalysis(id)))?.value ?? null;
  }

  async listCanvasAssetAnalyses(projectId: string, nodeIds?: string[]) {
    return (await this.requireProject(projectId)).repository.listCanvasAssetAnalyses(projectId, nodeIds);
  }

  async getCanvasContinuityBible(projectId: string) {
    return (await this.requireProject(projectId)).repository.getCanvasContinuityBible(projectId);
  }

  async saveCanvasContinuityBible(input: CanvasContinuityBible) {
    return (await this.requireProject(input.projectId)).repository.saveCanvasContinuityBible(input);
  }

  async createAsset(input: Omit<PipelineAsset, "createdAt" | "updatedAt">) {
    return (await this.requireProject(input.projectId)).repository.createAsset(input);
  }

  async getAsset(id: string) {
    return (await this.find((repository) => repository.getAsset(id)))?.value ?? null;
  }

  async listAssets(projectId: string, type?: PipelineAssetType) {
    return (await this.requireProject(projectId)).repository.listAssets(projectId, type);
  }

  async updateAsset(id: string, patch: Partial<PipelineAsset>) {
    const owner = await this.find((repository) => repository.getAsset(id));
    return owner ? owner.repository.updateAsset(id, patch) : null;
  }

  async deleteAsset(id: string) {
    const owner = await this.find((repository) => repository.getAsset(id));
    return owner ? owner.repository.deleteAsset(id) : false;
  }

  async addVariant(input: Omit<AssetVariant, "createdAt">) {
    const owner = await this.find((repository) => repository.getAsset(input.assetId));
    if (!owner) throw new AppError("PIPELINE_ASSET_NOT_FOUND", "Pipeline asset was not found", 404);
    return owner.repository.addVariant(input);
  }

  async listVariants(assetId: string) {
    const owner = await this.find((repository) => repository.getAsset(assetId));
    return owner ? owner.repository.listVariants(assetId) : [];
  }

  async updateVariant(id: string, patch: Partial<AssetVariant>) {
    const owner = await this.find((repository) => repository.updateVariant(id, patch));
    return owner?.value ?? null;
  }

  async updateVariantByRunId(runId: string, patch: Partial<AssetVariant>) {
    const owner = await this.find((repository) => repository.updateVariantByRunId(runId, patch));
    return owner?.value ?? null;
  }

  async deleteVariant(id: string) {
    return this.deleteFromOwner((repository) => repository.deleteVariant(id));
  }

  async createFrame(input: Omit<StoryboardFrame, "createdAt" | "updatedAt">) {
    return (await this.requireProject(input.projectId)).repository.createFrame(input);
  }

  async getFrame(id: string) {
    return (await this.find((repository) => repository.getFrame(id)))?.value ?? null;
  }

  async listFrames(projectId: string) {
    return (await this.requireProject(projectId)).repository.listFrames(projectId);
  }

  async updateFrame(id: string, patch: Partial<StoryboardFrame>) {
    const owner = await this.find((repository) => repository.getFrame(id));
    return owner ? owner.repository.updateFrame(id, patch) : null;
  }

  async deleteFrame(id: string) {
    const owner = await this.find((repository) => repository.getFrame(id));
    return owner ? owner.repository.deleteFrame(id) : false;
  }

  async reorderFrames(projectId: string, frameIds: string[]) {
    return (await this.requireProject(projectId)).repository.reorderFrames(projectId, frameIds);
  }

  async createCanvasNode(input: Omit<CanvasNode, "createdAt" | "updatedAt" | "width" | "height" | "data"> & {
    width?: number | null;
    height?: number | null;
    data?: CanvasNodeData | null;
  }) {
    return (await this.requireProject(input.projectId)).repository.createCanvasNode(input);
  }

  async getCanvasNode(id: string) {
    return (await this.find((repository) => repository.getCanvasNode(id)))?.value ?? null;
  }

  async listCanvasNodes(projectId: string) {
    return (await this.requireProject(projectId)).repository.listCanvasNodes(projectId);
  }

  async updateCanvasNodePosition(id: string, x: number, y: number) {
    const owner = await this.find((repository) => repository.getCanvasNode(id));
    if (owner) await owner.repository.updateCanvasNodePosition(id, x, y);
  }

  async updateCanvasNode(id: string, patch: Parameters<PipelineRepository["updateCanvasNode"]>[1]) {
    const owner = await this.find((repository) => repository.getCanvasNode(id));
    return owner ? owner.repository.updateCanvasNode(id, patch) : null;
  }

  async deleteCanvasNode(id: string) {
    const owner = await this.find((repository) => repository.getCanvasNode(id));
    return owner ? owner.repository.deleteCanvasNode(id) : false;
  }

  async findCanvasNodeByEntity(projectId: string, entityType: CanvasNodeType, entityId: string) {
    return (await this.requireProject(projectId)).repository.findCanvasNodeByEntity(projectId, entityType, entityId);
  }

  async createCanvasEdge(input: Omit<CanvasEdge, "id" | "createdAt" | "updatedAt">) {
    return (await this.requireProject(input.projectId)).repository.createCanvasEdge(input);
  }

  async getCanvasEdge(id: string) {
    return (await this.find((repository) => repository.getCanvasEdge(id)))?.value ?? null;
  }

  async listCanvasEdges(projectId: string) {
    return (await this.requireProject(projectId)).repository.listCanvasEdges(projectId);
  }

  async updateCanvasEdge(id: string, patch: { role?: CanvasEdge["role"]; order?: number }) {
    const owner = await this.find((repository) => repository.getCanvasEdge(id));
    return owner ? owner.repository.updateCanvasEdge(id, patch) : null;
  }

  async deleteCanvasEdge(id: string) {
    const owner = await this.find((repository) => repository.getCanvasEdge(id));
    return owner ? owner.repository.deleteCanvasEdge(id) : false;
  }

  async deleteCanvasEdgesByNode(nodeId: string) {
    const owner = await this.find((repository) => repository.getCanvasNode(nodeId));
    if (owner) await owner.repository.deleteCanvasEdgesByNode(nodeId);
  }

  async createLipSyncPreparation(input: Parameters<PipelineRepository["createLipSyncPreparation"]>[0]) {
    return (await this.requireProject(input.projectId)).repository.createLipSyncPreparation(input);
  }

  async getLipSyncPreparation(id: string) {
    return (await this.find((repository) => repository.getLipSyncPreparation(id)))?.value ?? null;
  }

  async findLipSyncPreparation(nodeId: string, videoFingerprint: string) {
    const owner = await this.find((repository) => repository.getCanvasNode(nodeId));
    return owner ? owner.repository.findLipSyncPreparation(nodeId, videoFingerprint) : null;
  }

  async updateLipSyncPreparation(
    id: string,
    patch: Parameters<PipelineRepository["updateLipSyncPreparation"]>[1],
  ) {
    const owner = await this.find((repository) => repository.getLipSyncPreparation(id));
    return owner ? owner.repository.updateLipSyncPreparation(id, patch) : null;
  }

  async getCanvasViewport(projectId: string) {
    return (await this.requireProject(projectId)).repository.getCanvasViewport(projectId);
  }

  async getCanvasRevision(projectId: string) {
    return (await this.requireProject(projectId)).repository.getCanvasRevision(projectId);
  }

  async updateCanvasViewport(projectId: string, viewport: CanvasViewport) {
    return (await this.requireProject(projectId)).repository.updateCanvasViewport(projectId, viewport);
  }

  async applyCanvasMutationBatch(projectId: string, baseRevision: number, mutations: CanvasMutation[]) {
    return (await this.requireProject(projectId)).repository.applyCanvasMutationBatch(projectId, baseRevision, mutations);
  }

  async createCanvasWorkflow(input: Omit<CanvasWorkflow, "createdAt" | "updatedAt">) {
    return (await this.requireProject(input.projectId)).repository.createCanvasWorkflow(input);
  }

  async listCanvasWorkflows(projectId: string) {
    return (await this.requireProject(projectId)).repository.listCanvasWorkflows(projectId);
  }

  async getCanvasWorkflow(id: string) {
    return (await this.find((repository) => repository.getCanvasWorkflow(id)))?.value ?? null;
  }

  async deleteCanvasWorkflow(id: string) {
    return this.deleteFromOwner((repository) => repository.deleteCanvasWorkflow(id));
  }

  async createCanvasWorkflowRun(input: Parameters<PipelineRepository["createCanvasWorkflowRun"]>[0]) {
    return (await this.requireProject(input.projectId)).repository.createCanvasWorkflowRun(input);
  }

  async getCanvasWorkflowRun(id: string) {
    return (await this.find((repository) => repository.getCanvasWorkflowRun(id)))?.value ?? null;
  }

  async findCanvasWorkflowRunByGenerationRunId(projectId: string, generationRunId: string) {
    return (await this.requireProject(projectId)).repository
      .findCanvasWorkflowRunByGenerationRunId(projectId, generationRunId);
  }

  async listCanvasWorkflowRuns(projectId: string, limit?: number) {
    return (await this.requireProject(projectId)).repository.listCanvasWorkflowRuns(projectId, limit);
  }

  async listActiveCanvasWorkflowRuns(projectId: string) {
    return (await this.requireProject(projectId)).repository.listActiveCanvasWorkflowRuns(projectId);
  }

  async updateCanvasWorkflowRun(
    id: string,
    patch: Parameters<PipelineRepository["updateCanvasWorkflowRun"]>[1],
  ) {
    const owner = await this.find((repository) => repository.getCanvasWorkflowRun(id));
    return owner ? owner.repository.updateCanvasWorkflowRun(id, patch) : null;
  }

  async updateCanvasWorkflowRunStep(
    runId: string,
    nodeId: string,
    patch: Parameters<PipelineRepository["updateCanvasWorkflowRunStep"]>[2],
  ) {
    const owner = await this.find((repository) => repository.getCanvasWorkflowRun(runId));
    return owner ? owner.repository.updateCanvasWorkflowRunStep(runId, nodeId, patch) : null;
  }

  async getStageStatuses(projectId: string): Promise<PipelineStageStatus[]> {
    return (await this.requireProject(projectId)).repository.getStageStatuses(projectId);
  }

  private async forProject(projectId: string): Promise<OpenProject | null> {
    const cached = this.opened.get(projectId);
    if (cached) return cached;
    const registration = await this.registry.get(projectId);
    if (!registration) return null;
    const rootPath = await resolveExistingDirectory(registration.rootPath);
    const manifest = await readManifest(rootPath);
    await requireProjectDatabase(rootPath);
    if (manifest.projectId !== projectId) {
      throw new AppError("VALIDATION_ERROR", "Pipeline project manifest does not match the project index", 400);
    }
    this.roots.addRoot(rootPath);
    return this.openDatabase(projectId, rootPath);
  }

  private async requireProject(projectId: string): Promise<OpenProject> {
    const project = await this.forProject(projectId);
    if (!project) throw new AppError("PIPELINE_PROJECT_NOT_FOUND", "Pipeline project was not found", 404);
    return project;
  }

  private openDatabase(projectId: string, rootPath: string): OpenProject {
    const database = new SqliteDatabase(databasePath(rootPath));
    const opened = { rootPath, database, repository: new SqlitePipelineRepository(database) };
    this.opened.set(projectId, opened);
    return opened;
  }

  private async find<T>(lookup: (repository: SqlitePipelineRepository) => Promise<T | null>): Promise<{
    repository: SqlitePipelineRepository;
    value: T;
  } | null> {
    for (const registration of await this.registry.list()) {
      let opened;
      try {
        opened = await this.forProject(registration.projectId);
      } catch {
        continue;
      }
      if (!opened) continue;
      const value = await lookup(opened.repository);
      if (value !== null) return { repository: opened.repository, value };
    }
    return null;
  }

  private async deleteFromOwner(remove: (repository: SqlitePipelineRepository) => Promise<boolean>) {
    for (const registration of await this.registry.list()) {
      const opened = await this.forProject(registration.projectId);
      if (opened && await remove(opened.repository)) return true;
    }
    return false;
  }
}

async function prepareNewProjectRoot(value: string) {
  if (!path.isAbsolute(value)) {
    throw new AppError("VALIDATION_ERROR", "Pipeline project path must be absolute", 400);
  }
  const requested = path.resolve(value);
  const name = path.basename(requested);
  if (!name || name === "." || name === "..") {
    throw new AppError("VALIDATION_ERROR", "Pipeline project folder name is invalid", 400);
  }
  const parent = await resolveExistingDirectory(path.dirname(requested));
  const rootPath = path.join(parent, name);
  try {
    await fs.access(rootPath);
    throw new AppError("VALIDATION_ERROR", "Pipeline project folder already exists", 409);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await fs.mkdir(rootPath);
  return rootPath;
}

async function createProjectDirectories(rootPath: string) {
  await Promise.all([
    fs.mkdir(path.join(rootPath, METADATA_DIRECTORY), { recursive: true }),
    fs.mkdir(path.join(rootPath, "assets", "imports"), { recursive: true }),
    fs.mkdir(path.join(rootPath, "generated"), { recursive: true }),
    fs.mkdir(path.join(rootPath, "exports"), { recursive: true }),
  ]);
}

async function resolveExistingDirectory(value: string) {
  if (!path.isAbsolute(value)) throw new AppError("VALIDATION_ERROR", "Project path must be absolute", 400);
  try {
    const resolved = await fs.realpath(value);
    if (!(await fs.stat(resolved)).isDirectory()) throw new Error("not-directory");
    return resolved;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("FILE_NOT_FOUND", "Pipeline project folder was not found", 404);
  }
}

async function readManifest(rootPath: string): Promise<ProjectManifest> {
  try {
    const value = JSON.parse(await fs.readFile(manifestPath(rootPath), "utf8")) as Partial<ProjectManifest>;
    if (value.format !== FORMAT || value.formatVersion !== FORMAT_VERSION
      || typeof value.projectId !== "string" || typeof value.title !== "string"
      || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") {
      throw new Error("invalid-manifest");
    }
    return value as ProjectManifest;
  } catch {
    throw new AppError("VALIDATION_ERROR", "The selected folder is not a Pipeline Studio project", 400);
  }
}

async function writeManifest(rootPath: string, manifest: ProjectManifest) {
  const target = manifestPath(rootPath);
  const temporary = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
}

function manifestPath(rootPath: string) {
  return path.join(rootPath, METADATA_DIRECTORY, MANIFEST_NAME);
}

function databasePath(rootPath: string) {
  return path.join(rootPath, METADATA_DIRECTORY, DATABASE_NAME);
}

async function requireProjectDatabase(rootPath: string) {
  try {
    if (!(await fs.stat(databasePath(rootPath))).isFile()) throw new Error("not-file");
  } catch {
    throw new AppError("VALIDATION_ERROR", "The selected folder does not contain a Pipeline Studio database", 400);
  }
}

function pathKey(value: string) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}
