import { randomUUID } from "node:crypto";
import path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { AgentService } from "@/server/application/agent-service";
import { AgentSettingsService } from "@/server/application/agent-settings-service";
import { GenerationRunService } from "@/server/application/content-generation/generation-run-service";
import { GenerationExecutionService } from "@/server/application/content-generation/generation-execution-service";
import { GenerationAssetService } from "@/server/application/content-generation/generation-asset-service";
import { GenerationWorker } from "@/server/application/content-generation/generation-worker";
import { GenerationAgentToolProvider } from "@/server/application/content-generation/generation-agent-tool-provider";
import { GenerationReviewRegistry } from "@/server/application/content-generation/generation-review-registry";
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
import { PiAgentSettingsStore } from "@/server/infrastructure/pi/pi-agent-settings-store";
import { PiCredentialProvider } from "@/server/infrastructure/pi/pi-credential-provider";
import { PiModelProvider } from "@/server/infrastructure/pi/pi-model-provider";
import { PiSessionRepository } from "@/server/infrastructure/pi/pi-session-repository";
import { PiSkillPackProvider } from "@/server/infrastructure/pi/pi-skill-pack-provider";
import { PiSkillProvider } from "@/server/infrastructure/pi/pi-skill-provider";
import { NodeProcessRunner } from "@/server/infrastructure/process/node-process-runner";
import { InMemoryAgentRegistry } from "@/server/infrastructure/runtime/in-memory-agent-registry";
import { PendingInputRegistry } from "@/server/infrastructure/runtime/pending-input-registry";
import { createRunningHubRoutes } from "@/server/infrastructure/content-generation/runninghub/runninghub-routes";
import { RunningHubAdapter } from "@/server/infrastructure/content-generation/runninghub/runninghub-adapter";
import { SqliteDatabase } from "@/server/infrastructure/sqlite/sqlite-database";
import { SqliteGenerationRepository } from "@/server/infrastructure/sqlite/sqlite-generation-repository";

function createContainer() {
  const sessions = new PiSessionRepository();
  const runtimes = new InMemoryAgentRegistry();
  const runtimeFactory = new PiAgentRuntimeFactory();
  const agentSettings = new PiAgentSettingsStore();
  const roots = new InMemoryWorkspaceRoots();
  const credentials = new PiCredentialProvider();
  const models = new PiModelProvider();
  const pendingInputs = new PendingInputRegistry();
  const fileSystem = new NodeWorkspaceFileService();
  const directoryBrowser = new NodeDirectoryBrowser();
  const projectRepository = new JsonProjectRepository(
    path.join(getAgentDir(), "projects.json"),
  );
  const processes = new NodeProcessRunner();
  const skills = new PiSkillProvider(processes);
  const skillPacks = new PiSkillPackProvider(undefined, undefined, undefined, roots);
  const instructionStore = new NodeInstructionStore(getAgentDir());
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
    const database = new SqliteDatabase(
      path.join(getAgentDir(), "po-agent.sqlite"),
    );
    const repository = new SqliteGenerationRepository(database);
    const ready = seedGenerationRoutes(repository, createRunningHubRoutes());
    generationCredentialStore = new FileGenerationCredentialStore(
      path.join(getAgentDir(), "generation-credentials.json"),
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

  return {
    roots,
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
    agentService: new AgentService(
      sessions,
      runtimes,
      runtimeFactory,
      roots,
      generationAgentTools,
      generationReviews,
    ),
    agentSettingsService: new AgentSettingsService(agentSettings, runtimes),
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

export type AppContainer = ReturnType<typeof createContainer>;

const globalContainer = globalThis as typeof globalThis & {
  __piAgentContainer?: AppContainer;
};

export const container =
  globalContainer.__piAgentContainer ?? createContainer();

if (process.env.NODE_ENV !== "production") {
  globalContainer.__piAgentContainer = container;
}
