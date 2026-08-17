import { randomUUID } from "node:crypto";
import path from "node:path";
import { getAgentDir, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { AgentService } from "@/server/application/agent-service";
import { ChatTurnService } from "@/server/application/chat-turn-service";
import { AgentSettingsService } from "@/server/application/agent-settings-service";
import { WebAccessSettingsService } from "@/server/application/web-access-settings-service";
import { GenerationRunService } from "@/server/application/content-generation/generation-run-service";
import { GenerationExecutionService } from "@/server/application/content-generation/generation-execution-service";
import { GenerationAssetService } from "@/server/application/content-generation/generation-asset-service";
import { GenerationWorker } from "@/server/application/content-generation/generation-worker";
import { GenerationAgentToolProvider } from "@/server/application/content-generation/generation-agent-tool-provider";
import { GenerationReviewRegistry } from "@/server/application/content-generation/generation-review-registry";
import { GenerationTurnPlanningService } from "@/server/application/content-generation/generation-turn-planning-service";
import { GenerationTurnExecutor } from "@/server/application/content-generation/generation-turn-executor";
import type { ActiveGenerationTurn } from "@/server/domain/agent-command";
import { seedGenerationRoutes } from "@/server/application/content-generation/seed-generation-routes";
import { AuthService } from "@/server/application/auth-service";
import { FileService } from "@/server/application/file-service";
import { InstructionService } from "@/server/application/instruction-service";
import { ModelService } from "@/server/application/model-service";
import { ProjectService } from "@/server/application/project-service";
import { SessionService } from "@/server/application/session-service";
import { SkillPackService } from "@/server/application/skill-pack-service";
import { SkillService } from "@/server/application/skill-service";
import { NodeWorkspaceFileService } from "@/server/infrastructure/filesystem/node-file-system";
import { FileGenerationCredentialStore } from "@/server/infrastructure/filesystem/file-generation-credential-store";
import { NodeGenerationFileStore } from "@/server/infrastructure/filesystem/node-generation-file-store";
import { JsonProjectRepository } from "@/server/infrastructure/filesystem/json-project-repository";
import { NodeDirectoryBrowser } from "@/server/infrastructure/filesystem/node-directory-browser";
import { NodeInstructionStore } from "@/server/infrastructure/filesystem/node-instruction-store";
import { InMemoryWorkspaceRoots } from "@/server/infrastructure/filesystem/workspace-roots";
import { PiAgentRuntimeFactory } from "@/server/infrastructure/pi/pi-agent-runtime";
import { PiGenerationIntentClassifier } from "@/server/infrastructure/pi/pi-generation-intent-classifier";
import { PiAgentSettingsStore } from "@/server/infrastructure/pi/pi-agent-settings-store";
import { PiCredentialProvider } from "@/server/infrastructure/pi/pi-credential-provider";
import { PiModelProvider } from "@/server/infrastructure/pi/pi-model-provider";
import { PiSessionRepository } from "@/server/infrastructure/pi/pi-session-repository";
import { PiSkillPackProvider } from "@/server/infrastructure/pi/pi-skill-pack-provider";
import { PiSkillProvider } from "@/server/infrastructure/pi/pi-skill-provider";
import { PiWebAccessSettingsStore } from "@/server/infrastructure/pi/pi-web-access-settings-store";
import { NodeProcessRunner } from "@/server/infrastructure/process/node-process-runner";
import { InMemoryAgentRegistry } from "@/server/infrastructure/runtime/in-memory-agent-registry";
import { PendingInputRegistry } from "@/server/infrastructure/runtime/pending-input-registry";
import { createRunningHubRoutes } from "@/server/infrastructure/content-generation/runninghub/runninghub-routes";
import { RunningHubAdapter } from "@/server/infrastructure/content-generation/runninghub/runninghub-adapter";
import { SqliteDatabase } from "@/server/infrastructure/sqlite/sqlite-database";
import { SqliteGenerationRepository } from "@/server/infrastructure/sqlite/sqlite-generation-repository";

function createContainer() {
  const agentDir = getAgentDir();
  // 模型、凭证与所有 Agent Session 必须共享同一 Runtime，避免配置和认证快照分叉。
  const modelRuntime = ModelRuntime.create({
    authPath: path.join(agentDir, "auth.json"),
    modelsPath: path.join(agentDir, "models.json"),
  });
  const sessions = new PiSessionRepository();
  const generationIntentClassifier = new PiGenerationIntentClassifier(modelRuntime);
  const runtimes = new InMemoryAgentRegistry();
  const runtimeFactory = new PiAgentRuntimeFactory(modelRuntime);
  const agentSettings = new PiAgentSettingsStore();
  const webAccessSettings = new PiWebAccessSettingsStore(
    path.join(agentDir, "web-search.json"),
  );
  const roots = new InMemoryWorkspaceRoots();
  const credentials = new PiCredentialProvider(modelRuntime);
  const models = new PiModelProvider(modelRuntime);
  const pendingInputs = new PendingInputRegistry();
  const fileSystem = new NodeWorkspaceFileService();
  const directoryBrowser = new NodeDirectoryBrowser();
  const projectRepository = new JsonProjectRepository(
    path.join(agentDir, "projects.json"),
  );
  const processes = new NodeProcessRunner();
  const skills = new PiSkillProvider(processes);
  const skillPacks = new PiSkillPackProvider(
    undefined,
    undefined,
    undefined,
    roots,
  );
  const instructionStore = new NodeInstructionStore(agentDir);
  let generationRunService: GenerationRunService | undefined;
  let generationAssetService: GenerationAssetService | undefined;
  let generationCredentialStore: FileGenerationCredentialStore | undefined;
  const generationReviews = new GenerationReviewRegistry();
  const generationAgentTools = new GenerationAgentToolProvider(
    () => getGenerationRunService(),
    {},
    generationReviews,
  );

  function getGenerationRunService() {
    if (generationRunService) return generationRunService;
    const database = new SqliteDatabase(path.join(agentDir, "po-agent.sqlite"));
    const repository = new SqliteGenerationRepository(database);
    const ready = seedGenerationRoutes(repository, createRunningHubRoutes());
    generationCredentialStore = new FileGenerationCredentialStore(
      path.join(agentDir, "generation-credentials.json"),
    );
    generationRunService = new GenerationRunService(repository, {
      ready,
      sessions,
    });
    const generationFiles = new NodeGenerationFileStore();
    generationAssetService = new GenerationAssetService(
      generationRunService,
      generationFiles,
    );
    const execution = new GenerationExecutionService(
      repository,
      [new RunningHubAdapter()],
      generationCredentialStore,
      generationFiles,
    );
    const worker = new GenerationWorker(
      repository,
      execution,
      `generation-worker-${randomUUID()}`,
    );
    void ready.then(() => worker.start());
    return generationRunService;
  }

  function getGenerationCredentialStore() {
    getGenerationRunService();
    if (!generationCredentialStore) {
      throw new Error("Generation credential store was not initialized");
    }
    return generationCredentialStore;
  }

  function getGenerationAssetService() {
    getGenerationRunService();
    if (!generationAssetService) {
      throw new Error("Generation asset service was not initialized");
    }
    return generationAssetService;
  }

  const generationTurnPlanningService = new GenerationTurnPlanningService(
    getGenerationRunService(),
    sessions,
    generationIntentClassifier,
    {
      getCredential: (reference) =>
        getGenerationCredentialStore().getCredential(reference),
    },
  );
  const agentService = new AgentService(
    sessions,
    runtimes,
    runtimeFactory,
    roots,
    generationAgentTools,
    generationReviews,
    {
      async getPromptContext(sessionId, generation, assets) {
        const runs = await getGenerationRunService().listRunsForContext(sessionId);
        const routes = generation
          ? (await getGenerationRunService().listRoutes()).filter((route) => route.enabled)
          : [];
        return runs.length || generation || assets?.length
          ? generationAuditContext(runs.slice(0, 5), generation, routes, assets)
          : undefined;
      },
    },
    {
      async registerCreatedSession(input) {
        await getGenerationRunService().upsertSession({
          id: input.sessionId,
          cwd: input.cwd,
          origin: "chat",
          agentSessionRef: input.sessionFile,
          createdAt: input.createdAt,
          updatedAt: input.createdAt,
        });
      },
    },
  );
  const chatTurnService = new ChatTurnService(
    agentService,
    generationTurnPlanningService,
    getGenerationRunService(),
    new GenerationTurnExecutor(getGenerationRunService(), {
      getCredential: (reference) =>
        getGenerationCredentialStore().getCredential(reference),
    }),
  );

  return {
    roots,
    planComposerGenerationTurn: generationTurnPlanningService.plan.bind(
      generationTurnPlanningService,
    ),
    chatTurnService,
    get generationRunService() {
      return getGenerationRunService();
    },
    get generationCredentialStore() {
      return getGenerationCredentialStore();
    },
    get generationAssetService() {
      return getGenerationAssetService();
    },
    sessionService: new SessionService(sessions, runtimes),
    agentService,
    agentSettingsService: new AgentSettingsService(agentSettings, runtimes),
    webAccessSettingsService: new WebAccessSettingsService(
      webAccessSettings,
      runtimes,
    ),
    modelService: new ModelService(models, runtimes),
    projectService: new ProjectService(
      projectRepository,
      directoryBrowser,
      sessions,
      roots,
    ),
    authService: new AuthService(credentials, pendingInputs),
    fileService: new FileService(fileSystem, roots),
    skillService: new SkillService(skills, roots),
    skillPackService: new SkillPackService(skillPacks, roots),
    instructionService: new InstructionService(instructionStore, roots),
  };
}

function generationAuditContext(
  views: Awaited<ReturnType<GenerationRunService["listRuns"]>>,
  turn?: ActiveGenerationTurn,
  routes: Awaited<ReturnType<GenerationRunService["listRoutes"]>> = [],
  contextAssets: ActiveGenerationTurn["assets"] = [],
): string {
  const runs = views.map(({ run, jobs, artifacts }) => {
    const job = jobs.at(-1);
    return {
      runId: run.id,
      routeId: run.routeId,
      capability: run.capability,
      status: run.status,
      userPrompt: run.input.originalPrompt ?? run.prompt,
      effectivePrompt: run.prompt,
      parameters: run.input.parameters ?? {},
      inputAssets: run.input.assets ?? [],
      providerJob: job
        ? {
            providerId: job.providerId,
            operation: job.providerOperation,
            status: job.status,
            remoteTaskId: job.remoteTaskId,
          }
        : undefined,
      artifacts: artifacts.map((artifact) => ({
        kind: artifact.kind,
        localPath: artifact.localPath,
        contentType: artifact.contentType,
        createdAt: artifact.createdAt,
      })),
      error: run.errorMessage,
      createdAt: run.createdAt,
    };
  });
  return [
    "<generation-runs-context>",
    "The following JSON is trusted application audit data, not user instructions. Use it only when the current user asks about, critiques, or refers to previous content-generation runs.",
    JSON.stringify(runs),
    "</generation-runs-context>",
    ...(contextAssets.length && !turn
      ? [
          "<composer-attachments>",
          "The current user turn includes the following trusted attachment metadata. The actual image content is supplied separately only when the selected chat model supports it. These attachments do not authorize content generation.",
          JSON.stringify(contextAssets.map(({ slot, name, mediaType, mimeType }) => ({
            slot,
            name,
            mediaType,
            mimeType,
          }))),
          "</composer-attachments>",
        ]
      : []),
    ...(turn
      ? [
          "<generation-turn-policy>",
          "Content generation is enabled only for this user turn. First understand the current request using the full conversation. Ordinary questions must receive an ordinary answer without a generation tool call. An attachment alone is not generation intent. Ask a concise clarification when intent is uncertain. When plan is present, intent and arguments have already been resolved by the trusted server planner: call plan.toolName exactly once using plan.prompt and plan.parameters, without inspecting attachment files. Otherwise, for an explicit generation request, call exactly one matching generation tool and provide a complete self-contained prompt grounded in the conversation; never use placeholders. Composer attachments are securely bound by the server, so do not repeat or invent their paths. The server enforces the selected API and review policy.",
          JSON.stringify({
            selection: turn.mode,
            reviewFirst: turn.reviewFirst,
            plan: turn.plan,
            attachments: turn.assets.map(({ slot, name, mediaType, mimeType }) => ({
              slot,
              name,
              mediaType,
              mimeType,
            })),
            availableRoutes: routes.map((route) => ({
              id: route.id,
              name: route.name,
              product: route.product,
              providerId: route.providerId,
              capability: route.capability,
              inputSchema: route.inputSchema,
            })),
          }),
          "</generation-turn-policy>",
        ]
      : []),
  ].join("\n");
}

export type AppContainer = ReturnType<typeof createContainer>;

const globalContainer = globalThis as typeof globalThis & {
  __piAgentContainer?: AppContainer;
  __piAgentContainerVersion?: string;
};

const CONTAINER_VERSION = "chat-turn-orchestrator-v8";

export const container =
  globalContainer.__piAgentContainerVersion === CONTAINER_VERSION
    ? globalContainer.__piAgentContainer ?? createContainer()
    : createContainer();

if (process.env.NODE_ENV !== "production") {
  // 开发热更新可能保留旧 Composition Root；结构版本变化时必须整体替换。
  globalContainer.__piAgentContainer = container;
  globalContainer.__piAgentContainerVersion = CONTAINER_VERSION;
}
