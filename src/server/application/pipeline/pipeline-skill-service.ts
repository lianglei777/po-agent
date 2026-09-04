import type {
  ImportPipelineSkillRequest,
  InstallPipelineSkillRequest,
  PipelineSkillLoadResponse,
  PipelineSkillMutationResponse,
  UpdatePipelineSkillRequest,
} from "@/contracts/pipeline-agent";
import { AppError } from "@/server/domain/app-error";
import type { SkillProvider } from "@/server/ports/skill-provider";
import type { PipelineBuiltinSkillSource } from "@/server/ports/pipeline-builtin-skill-source";
import type { PipelineRepository } from "@/server/ports/pipeline-repository";
import type { AgentService } from "@/server/application/agent-service";

/** Pipeline Skill 只能安装和修改为当前项目级，避免一个项目改变其它项目的创作方法。 */
export class PipelineSkillService {
  constructor(
    private readonly repository: PipelineRepository,
    private readonly skills: SkillProvider,
    private readonly agents: Pick<AgentService, "execute">,
    private readonly builtinSkills: PipelineBuiltinSkillSource,
  ) {}

  async load(projectId: string): Promise<PipelineSkillLoadResponse> {
    return this.skills.load(await this.root(projectId));
  }

  async update(projectId: string, input: UpdatePipelineSkillRequest): Promise<PipelineSkillMutationResponse> {
    const cwd = await this.root(projectId);
    const loaded = await this.skills.load(cwd);
    const skill = loaded.skills.find((candidate) => candidate.skillId === input.skillId);
    if (!skill || skill.sourceInfo.scope !== "project") {
      throw new AppError("SKILL_NOT_FOUND", "Only skills installed for this Pipeline project can be changed here", 404);
    }
    const result = await this.skills.setModelInvocationDisabled({ ...input, cwd });
    return { ...result, sessionReloaded: await this.reloadAgent(projectId) };
  }

  async install(projectId: string, input: InstallPipelineSkillRequest): Promise<PipelineSkillMutationResponse> {
    const cwd = await this.root(projectId);
    await this.skills.install({ packageSpec: input.package, scope: "project", cwd });
    return { ...(await this.skills.load(cwd)), sessionReloaded: await this.reloadAgent(projectId) };
  }

  async importLocal(projectId: string, input: ImportPipelineSkillRequest): Promise<PipelineSkillMutationResponse> {
    const cwd = await this.root(projectId);
    await this.skills.importLocal({ sourceFilePath: input.sourceFilePath, scope: "project", cwd });
    return { ...(await this.skills.load(cwd)), sessionReloaded: await this.reloadAgent(projectId) };
  }

  async installShortDrama(projectId: string): Promise<PipelineSkillMutationResponse> {
    const cwd = await this.root(projectId);
    await this.skills.importLocal({
      sourceFilePath: await this.builtinSkills.shortDrama(),
      scope: "project",
      cwd,
    });
    return { ...(await this.skills.load(cwd)), sessionReloaded: await this.reloadAgent(projectId) };
  }

  search(query: string, limit = 20) {
    return this.skills.search(query, limit);
  }

  async reload(projectId: string): Promise<{ sessionReloaded: boolean }> {
    return { sessionReloaded: await this.reloadAgent(projectId) };
  }

  private async root(projectId: string): Promise<string> {
    const root = await this.repository.getProjectRoot(projectId);
    if (!root) throw new AppError("PIPELINE_PROJECT_NOT_FOUND", "Pipeline project was not found", 404);
    return root;
  }

  private async reloadAgent(projectId: string): Promise<boolean> {
    const conversation = await this.repository.getAgentConversation(projectId);
    if (!conversation) return false;
    try {
      await this.agents.execute(conversation.sessionId, { type: "reload_instructions" });
      return true;
    } catch (error) {
      if (hasErrorCode(error, "AGENT_BUSY")) return false;
      throw error;
    }
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error &&
    (error as { code?: unknown }).code === code;
}
