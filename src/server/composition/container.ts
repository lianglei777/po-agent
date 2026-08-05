import path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { AgentService } from "@/server/application/agent-service";
import { ContentGenerationService } from "@/server/application/content-generation-service";
import { ContentGenerationDocumentationService } from "@/server/application/content-generation-documentation-service";
import { AuthService } from "@/server/application/auth-service";
import { FileService } from "@/server/application/file-service";
import { InstructionService } from "@/server/application/instruction-service";
import { ModelService } from "@/server/application/model-service";
import { ProjectService } from "@/server/application/project-service";
import { SessionService } from "@/server/application/session-service";
import { SkillPackService } from "@/server/application/skill-pack-service";
import { SkillService } from "@/server/application/skill-service";
import { NodeWorkspaceFileService } from "@/server/infrastructure/filesystem/node-file-system";
import { NodeContentGenerationArtifactStore } from "@/server/infrastructure/filesystem/node-content-generation-artifact-store";
import { JsonContentGenerationRepository } from "@/server/infrastructure/filesystem/json-content-generation-repository";
import { MarkdownContentGenerationDocumentationRepository } from "@/server/infrastructure/filesystem/markdown-content-generation-documentation-repository";
import { JsonProjectRepository } from "@/server/infrastructure/filesystem/json-project-repository";
import { NodeDirectoryBrowser } from "@/server/infrastructure/filesystem/node-directory-browser";
import { NodeInstructionStore } from "@/server/infrastructure/filesystem/node-instruction-store";
import { InMemoryWorkspaceRoots } from "@/server/infrastructure/filesystem/workspace-roots";
import { PiAgentRuntimeFactory } from "@/server/infrastructure/pi/pi-agent-runtime";
import { PiCredentialProvider } from "@/server/infrastructure/pi/pi-credential-provider";
import { PiModelProvider } from "@/server/infrastructure/pi/pi-model-provider";
import { PiSessionRepository } from "@/server/infrastructure/pi/pi-session-repository";
import { PiSkillPackProvider } from "@/server/infrastructure/pi/pi-skill-pack-provider";
import { PiSkillProvider } from "@/server/infrastructure/pi/pi-skill-provider";
import { NodeProcessRunner } from "@/server/infrastructure/process/node-process-runner";
import { InMemoryAgentRegistry } from "@/server/infrastructure/runtime/in-memory-agent-registry";
import { PendingInputRegistry } from "@/server/infrastructure/runtime/pending-input-registry";
import { HttpContentGenerationProvider } from "@/server/infrastructure/http/http-content-generation-provider";

function createContainer() {
  const sessions = new PiSessionRepository();
  const runtimes = new InMemoryAgentRegistry();
  const runtimeFactory = new PiAgentRuntimeFactory();
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
  const contentGenerationRepository = new JsonContentGenerationRepository(
    path.join(getAgentDir(), "content-generation.json"),
  );
  const contentGenerationService = new ContentGenerationService(
    contentGenerationRepository,
    new HttpContentGenerationProvider(),
    new NodeContentGenerationArtifactStore(),
    roots,
  );
  const contentGenerationDocumentationService = new ContentGenerationDocumentationService(
    new MarkdownContentGenerationDocumentationRepository(
      path.join(process.cwd(), "docs", "RunningHubAPIs", "seedance2.0"),
    ),
  );

  return {
    roots,
    contentGenerationService,
    contentGenerationDocumentationService,
    sessionService: new SessionService(sessions, runtimes, contentGenerationService),
    agentService: new AgentService(
      sessions,
      runtimes,
      runtimeFactory,
      roots,
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

export type AppContainer = ReturnType<typeof createContainer>;

const globalContainer = globalThis as typeof globalThis & {
  __piAgentContainer?: AppContainer;
};

export const container =
  globalContainer.__piAgentContainer ?? createContainer();

if (process.env.NODE_ENV !== "production") {
  globalContainer.__piAgentContainer = container;
}
