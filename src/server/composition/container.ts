import { randomUUID } from "node:crypto";
import path from "node:path";
import { getAgentDir, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { AgentService } from "@/server/application/agent-service";
import { ChatTurnService } from "@/server/application/chat-turn-service";
import { AgentSettingsService } from "@/server/application/agent-settings-service";
import { WebAccessSettingsService } from "@/server/application/web-access-settings-service";
import { AccessControlService } from "@/server/application/access-control-service";
import { GenerationRunService } from "@/server/application/content-generation/generation-run-service";
import { GenerationProviderSettingsService } from "@/server/application/content-generation/generation-provider-settings-service";
import { GenerationExecutionService } from "@/server/application/content-generation/generation-execution-service";
import { GenerationAssetService } from "@/server/application/content-generation/generation-asset-service";
import { GenerationWorker } from "@/server/application/content-generation/generation-worker";
import { GenerationAgentToolProvider } from "@/server/application/content-generation/generation-agent-tool-provider";
import { GenerationReviewRegistry } from "@/server/application/content-generation/generation-review-registry";
import { GenerationTurnPlanningService } from "@/server/application/content-generation/generation-turn-planning-service";
import { GenerationTurnExecutor } from "@/server/application/content-generation/generation-turn-executor";
import type { ActiveGenerationTurn } from "@/server/domain/agent-command";
import { seedGenerationRoutes } from "@/server/application/content-generation/seed-generation-routes";
import {
  createGenerationProviders,
  createGenerationProviderDescriptors,
  createGenerationRoutes,
  createGenerationWorkerPolicies,
} from "@/server/composition/content-generation-provider-modules";
import { AuthService } from "@/server/application/auth-service";
import { FileService } from "@/server/application/file-service";
import { InstructionService } from "@/server/application/instruction-service";
import { ModelService } from "@/server/application/model-service";
import { ProjectService } from "@/server/application/project-service";
import { SessionService } from "@/server/application/session-service";
import { SkillPackService } from "@/server/application/skill-pack-service";
import { SkillService } from "@/server/application/skill-service";
import { NodeWorkspaceFileService } from "@/server/infrastructure/filesystem/node-file-system";
import { FileAccessControlStore } from "@/server/infrastructure/filesystem/file-access-control-store";
import { FileGenerationCredentialStore } from "@/server/infrastructure/filesystem/file-generation-credential-store";
import { NodeGenerationFileStore } from "@/server/infrastructure/filesystem/node-generation-file-store";
import { StaticGenerationProviderDirectory } from "@/server/infrastructure/content-generation/static-generation-provider-directory";
import { JsonProjectRepository } from "@/server/infrastructure/filesystem/json-project-repository";
import { NodeDirectoryBrowser } from "@/server/infrastructure/filesystem/node-directory-browser";
import { NodeInstructionStore } from "@/server/infrastructure/filesystem/node-instruction-store";
import { JsonPipelineProjectRegistry } from "@/server/infrastructure/filesystem/json-pipeline-project-registry";
import { LocalPipelineRepository } from "@/server/infrastructure/filesystem/local-pipeline-repository";
import { InMemoryWorkspaceRoots } from "@/server/infrastructure/filesystem/workspace-roots";
import { PiAgentRuntimeFactory } from "@/server/infrastructure/pi/pi-agent-runtime";
import { PiGenerationIntentClassifier } from "@/server/infrastructure/pi/pi-generation-intent-classifier";
import { PiAgentSettingsStore } from "@/server/infrastructure/pi/pi-agent-settings-store";
import { PiCredentialProvider } from "@/server/infrastructure/pi/pi-credential-provider";
import { PiModelProvider } from "@/server/infrastructure/pi/pi-model-provider";
import { PiSessionRepository } from "@/server/infrastructure/pi/pi-session-repository";
import { PiSkillPackProvider } from "@/server/infrastructure/pi/pi-skill-pack-provider";
import { PiSkillProvider } from "@/server/infrastructure/pi/pi-skill-provider";
import { BundledPipelineSkillSource } from "@/server/infrastructure/filesystem/bundled-pipeline-skill-source";
import { PiWebAccessSettingsStore } from "@/server/infrastructure/pi/pi-web-access-settings-store";
import { NodeProcessRunner } from "@/server/infrastructure/process/node-process-runner";
import { InMemoryAgentRegistry } from "@/server/infrastructure/runtime/in-memory-agent-registry";
import { PendingInputRegistry } from "@/server/infrastructure/runtime/pending-input-registry";
import { SqliteDatabase } from "@/server/infrastructure/sqlite/sqlite-database";
import { SqliteGenerationRepository } from "@/server/infrastructure/sqlite/sqlite-generation-repository";
import { InMemoryPipelineSse } from "@/server/infrastructure/runtime/in-memory-pipeline-sse";
import { PiLlmAdapter } from "@/server/infrastructure/pi/pi-llm-adapter";
import { AssetGenerationService } from "@/server/application/pipeline/asset-generation-service";
import { VideoGenerationService } from "@/server/application/pipeline/video-generation-service";
import { ScriptAnalysisService } from "@/server/application/pipeline/script-analysis-service";
import { StoryboardService } from "@/server/application/pipeline/storyboard-service";
import { CanvasStudioService } from "@/server/application/pipeline/canvas-studio-service";
import { LipSyncPreparationService } from "@/server/application/pipeline/lip-sync-preparation-service";
import { RunningHubLipSyncProvider } from "@/server/infrastructure/content-generation/runninghub/runninghub-lip-sync-provider";
import { RUNNINGHUB_CREDENTIAL_REF } from "@/server/infrastructure/content-generation/runninghub/runninghub-provider-constants";
import { CompositeAgentToolProvider } from "@/server/application/pipeline/composite-agent-tool-provider";
import { PipelineAgentToolProvider } from "@/server/application/pipeline/pipeline-agent-tool-provider";
import { PipelineAgentConversationService } from "@/server/application/pipeline/pipeline-agent-conversation-service";
import { PipelineSkillService } from "@/server/application/pipeline/pipeline-skill-service";
import { CanvasAgentContextAssembler } from "@/server/application/pipeline/canvas-agent-context-assembler";
import { CanvasAgentIntentResolver } from "@/server/application/pipeline/canvas-agent-intent-resolver";
import { CanvasAgentTurnPolicyRegistry } from "@/server/application/pipeline/canvas-agent-turn-policy-registry";
import { CanvasAgentPlanService } from "@/server/application/pipeline/canvas-agent-plan-service";
import { CanvasAssetAnalysisService } from "@/server/application/pipeline/canvas-asset-analysis-service";
import { CanvasContinuityService } from "@/server/application/pipeline/canvas-continuity-service";
import { PiCanvasAssetAnalyzer } from "@/server/infrastructure/pi/pi-canvas-asset-analyzer";
import { FfmpegCanvasMediaPreprocessor } from "@/server/infrastructure/media/ffmpeg-canvas-media-preprocessor";
import type { PipelineRepository } from "@/server/ports/pipeline-repository";
import { NodeAccessControlPasswordHasher } from "@/server/infrastructure/security/node-access-control-password-hasher";
import { FileHttpUnexpectedErrorLogger } from "@/server/infrastructure/observability/file-http-unexpected-error-logger";

function createContainer() {
  const agentDir = getAgentDir();
  const accessControlService = new AccessControlService(
    new FileAccessControlStore(path.join(agentDir, "access-control.json")),
    new NodeAccessControlPasswordHasher(),
    { developmentBypass: process.env.NODE_ENV === "development" },
  );
  const httpUnexpectedErrorLogger = new FileHttpUnexpectedErrorLogger(
    path.join(agentDir, "logs", "http-errors.jsonl"),
  );
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
  const pipelineProjectRegistry = new JsonPipelineProjectRegistry(
    path.join(agentDir, "pipeline-projects.json"),
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
  let generationProviderSettingsService: GenerationProviderSettingsService | undefined;
  let generationAssetService: GenerationAssetService | undefined;
  let generationCredentialStore: FileGenerationCredentialStore | undefined;
  const generationReviews = new GenerationReviewRegistry();
  const generationProviderDescriptors = createGenerationProviderDescriptors();
  const generationProviderDirectory = new StaticGenerationProviderDirectory(
    generationProviderDescriptors,
  );
  const generationAgentTools = new GenerationAgentToolProvider(
    () => getGenerationRunService(),
    {},
    generationReviews,
  );

  let sharedDatabase: SqliteDatabase | undefined;

  function getDatabase() {
    if (sharedDatabase) return sharedDatabase;
    sharedDatabase = new SqliteDatabase(path.join(agentDir, "po-agent.sqlite"));
    return sharedDatabase;
  }

  function getGenerationRunService() {
    if (generationRunService) return generationRunService;
    const database = getDatabase();
    const repository = new SqliteGenerationRepository(database);
    const ready = seedGenerationRoutes(repository, createGenerationRoutes());
    generationCredentialStore = new FileGenerationCredentialStore(
      path.join(agentDir, "generation-credentials.json"),
      process.env,
      Object.fromEntries(generationProviderDescriptors.flatMap((provider) =>
        provider.credential
          ? [[provider.credential.reference, provider.credential.environmentVariable]]
          : [],
      )),
    );
    generationProviderSettingsService = new GenerationProviderSettingsService(
      repository,
      generationCredentialStore,
      generationProviderDirectory,
    );
    generationRunService = new GenerationRunService(repository, {
      ready,
      sessions,
      credentials: generationCredentialStore,
    });
    const generationFiles = new NodeGenerationFileStore();
    generationAssetService = new GenerationAssetService(
      generationRunService,
      generationFiles,
    );
    const execution = new GenerationExecutionService(
      repository,
      createGenerationProviders(),
      generationCredentialStore,
      generationFiles,
    );
    // 方案 A — Worker 完成回调: 回填 pipeline variant artifactId 并推送 SSE
    execution.onComplete = async (runId, artifacts) => {
      try {
        const run = await repository.getRun(runId);
        if (!run?.sourceRef?.startsWith("pipeline:")) return;
        const pipelineRepo = getPipelineRepository();
        const pipelineSse = getPipelineSse();
        const artifactId = artifacts[0]?.id ?? null;

        if (run.sourceRef.startsWith("pipeline:canvas:")) {
          const nodeId = run.sourceRef.slice("pipeline:canvas:".length);
          await getPipelineServices().canvasStudioService!.completeGeneration(nodeId, runId, artifacts);
        } else if (run.sourceRef.includes(":image:")) {
          // 分镜图生成完成 — 回填 frame.selectedImageArtifactId
          const frameId = run.sourceRef.split(":")[2];
          await pipelineRepo.updateFrame(frameId, {
            selectedImageArtifactId: artifactId,
            status: "completed",
          });
        } else if (run.sourceRef.includes(":i2v") || run.sourceRef.includes(":r2v")) {
          // 视频生成完成 — 不自动选择最终 take，由用户决定
        } else {
          // 资产图生成完成 — 回填 AssetVariant
          const variant = await pipelineRepo.updateVariantByRunId(runId, {
            artifactId,
          });
          if (variant) {
            await pipelineRepo.updateAsset(variant.assetId, {
              selectedArtifactId: artifactId,
              status: "completed",
            });
          }
        }
        // 推送 SSE
        pipelineSse.emit({
          type: "generation_completed",
          projectId: run.sessionId.replace("pipeline:", ""),
          payload: { runId, artifacts },
        });
      } catch {
        // 回填失败不影响 Worker 主流程
      }
    };
    execution.onFail = async (runId, _code, message) => {
      try {
        const run = await repository.getRun(runId);
        if (!run?.sourceRef?.startsWith("pipeline:canvas:")) return;
        const nodeId = run.sourceRef.slice("pipeline:canvas:".length);
        await getPipelineServices().canvasStudioService!.failGeneration(nodeId, runId, message);
      } catch {
        // 回填失败不影响 Worker 主流程。
      }
    };
    const worker = new GenerationWorker(
      repository,
      execution,
      `generation-worker-${randomUUID()}`,
      undefined,
      undefined,
      undefined,
      createGenerationWorkerPolicies(),
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

  function getGenerationProviderSettingsService() {
    getGenerationRunService();
    if (!generationProviderSettingsService) {
      throw new Error("Generation provider settings service was not initialized");
    }
    return generationProviderSettingsService;
  }

  const canvasAgentTurnPolicies = new CanvasAgentTurnPolicyRegistry();
  let pipelineRepository: PipelineRepository | undefined;
  let canvasStudioService: CanvasStudioService | undefined;

  function getPipelineRepository() {
    if (pipelineRepository) return pipelineRepository;
    pipelineRepository = new LocalPipelineRepository(pipelineProjectRegistry, roots);
    pipelineSse = new InMemoryPipelineSse();
    pipelineLlm = new PiLlmAdapter(modelRuntime);
    scriptAnalysisService = new ScriptAnalysisService(pipelineLlm, pipelineRepository, pipelineSse);
    storyboardService = new StoryboardService(pipelineLlm, pipelineRepository, getGenerationRunService(), pipelineSse);
    assetGenerationService = new AssetGenerationService(pipelineRepository, getGenerationRunService(), pipelineSse);
    videoGenerationService = new VideoGenerationService(pipelineRepository, getGenerationRunService(), pipelineSse);
    const lipSyncPreparations = new LipSyncPreparationService(
      pipelineRepository,
      new RunningHubLipSyncProvider(),
      getGenerationCredentialStore(),
      RUNNINGHUB_CREDENTIAL_REF,
    );
    canvasStudioService = new CanvasStudioService(
      pipelineRepository,
      getGenerationRunService(),
      getGenerationAssetService(),
      pipelineLlm,
      pipelineSse,
      lipSyncPreparations,
    );
    pipelineAgentPlanService = new CanvasAgentPlanService(
      pipelineRepository,
      canvasStudioService,
      canvasAgentTurnPolicies,
    );
    const canvasAssetAnalysisService = new CanvasAssetAnalysisService(
      pipelineRepository,
      canvasStudioService,
      new PiCanvasAssetAnalyzer(modelRuntime),
      new FfmpegCanvasMediaPreprocessor(),
    );
    const canvasContinuityService = new CanvasContinuityService(
      pipelineRepository,
      canvasAgentTurnPolicies,
    );
    pipelineAgentTools = new PipelineAgentToolProvider(
      scriptAnalysisService,
      storyboardService,
      assetGenerationService,
      videoGenerationService,
      pipelineRepository,
      canvasAgentTurnPolicies,
      pipelineAgentPlanService,
      canvasAssetAnalysisService,
      canvasContinuityService,
      canvasStudioService,
    );
    return pipelineRepository;
  }

  let assetGenerationService: AssetGenerationService | undefined;
  let videoGenerationService: VideoGenerationService | undefined;
  let pipelineSse: InMemoryPipelineSse | undefined;
  let pipelineLlm: PiLlmAdapter | undefined;
  let scriptAnalysisService: ScriptAnalysisService | undefined;
  let storyboardService: StoryboardService | undefined;
  let pipelineAgentTools: PipelineAgentToolProvider | undefined;
  let pipelineAgentPlanService: CanvasAgentPlanService | undefined;

  function getPipelineServices() {
    getPipelineRepository();
    return {
      pipelineSse,
      pipelineLlm,
      scriptAnalysisService,
      storyboardService,
      canvasStudioService,
      pipelineAgentTools,
      pipelineAgentPlanService,
    };
  }

  function getPipelineSse() {
    getPipelineServices();
    if (!pipelineSse) throw new Error("Pipeline SSE not initialized");
    return pipelineSse;
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
  // 工具提供者按服务端会话作用域筛选，普通 Chat 与 Pipeline Agent 不共享写能力。
  const compositeAgentTools = new CompositeAgentToolProvider([
    generationAgentTools,
    { getTools: (input) => getPipelineServices().pipelineAgentTools!.getTools(input) },
  ]);
  const agentService = new AgentService(
    sessions,
    runtimes,
    runtimeFactory,
    roots,
    compositeAgentTools,
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
    {
      async getPipelineProjectId(sessionId) {
        return (await getPipelineRepository().findAgentConversationBySessionId(sessionId))?.projectId ?? null;
      },
    },
  );
  const pipelineAgentConversationService = new PipelineAgentConversationService(
    getPipelineRepository(),
    agentService,
    sessions,
    new CanvasAgentContextAssembler(getPipelineRepository()),
    new CanvasAgentIntentResolver(getPipelineServices().pipelineLlm!, sessions),
    canvasAgentTurnPolicies,
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
    accessControlService,
    httpUnexpectedErrorLogger,
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
    get generationProviderSettingsService() {
      return getGenerationProviderSettingsService();
    },
    get generationAssetService() {
      return getGenerationAssetService();
    },
    sessionService: new SessionService(sessions, runtimes),
    agentService,
    pipelineAgentConversationService,
    pipelineSkillService: new PipelineSkillService(
      getPipelineRepository(),
      skills,
      agentService,
      new BundledPipelineSkillSource(
        process.env.PO_AGENT_PIPELINE_SKILLS_DIR
          ?? path.join(process.cwd(), "resources", "pipeline-skills"),
      ),
    ),
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
    get pipelineRepository() {
      return getPipelineRepository();
    },
    get pipelineSse() {
      getPipelineServices();
      return pipelineSse!;
    },
    get scriptAnalysisService() {
      getPipelineServices();
      return scriptAnalysisService!;
    },
    get storyboardService() {
      getPipelineServices();
      return storyboardService!;
    },
    get assetGenerationService() {
      getPipelineServices();
      return assetGenerationService!;
    },
    get videoGenerationService() {
      getPipelineServices();
      return videoGenerationService!;
    },
    get canvasStudioService() {
      getPipelineServices();
      return canvasStudioService!;
    },
    get pipelineAgentTools() {
      getPipelineServices();
      return pipelineAgentTools!;
    },
    get pipelineAgentPlanService() {
      getPipelineServices();
      return pipelineAgentPlanService!;
    },
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
              description: route.description,
              tags: route.tags,
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

// 开发热更新会保留全局容器，而 Provider descriptor 在容器创建时已冻结；注册表变化必须使旧容器失效。
const CONTAINER_VERSION = "generation-qianwen-production-v12";

export const container =
  globalContainer.__piAgentContainerVersion === CONTAINER_VERSION
    ? globalContainer.__piAgentContainer ?? createContainer()
    : createContainer();

if (process.env.NODE_ENV !== "production") {
  // 开发热更新可能保留旧 Composition Root；结构版本变化时必须整体替换。
  globalContainer.__piAgentContainer = container;
  globalContainer.__piAgentContainerVersion = CONTAINER_VERSION;
}
