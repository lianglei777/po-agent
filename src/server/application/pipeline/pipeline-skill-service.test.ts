import { describe, expect, it, vi } from "vitest";
import type { AgentService } from "@/server/application/agent-service";
import type { PipelineRepository } from "@/server/ports/pipeline-repository";
import type { SkillProvider } from "@/server/ports/skill-provider";
import { PipelineSkillService } from "./pipeline-skill-service";

describe("PipelineSkillService", () => {
  it("installs a Skill only in the owning project and reloads its Agent", async () => {
    const skills = {
      install: vi.fn(),
      load: vi.fn(async () => ({ skills: [], diagnostics: [] })),
    } as unknown as SkillProvider;
    const agent = { execute: vi.fn(async () => ({ success: true })) } as unknown as Pick<AgentService, "execute">;
    const service = new PipelineSkillService({
      getProjectRoot: vi.fn(async () => "D:\\project-a"),
      getAgentConversation: vi.fn(async () => ({ sessionId: "session-a" })),
    } as unknown as PipelineRepository, skills, agent, { shortDrama: vi.fn() });

    await service.install("project-a", { package: "@example/product-ad" });

    expect(skills.install).toHaveBeenCalledWith({ packageSpec: "@example/product-ad", scope: "project", cwd: "D:\\project-a" });
    expect(agent.execute).toHaveBeenCalledWith("session-a", { type: "reload_instructions" });
  });

  it("does not permit a Pipeline panel to change global Skills", async () => {
    const service = new PipelineSkillService({
      getProjectRoot: vi.fn(async () => "D:\\project-a"),
      getAgentConversation: vi.fn(),
    } as unknown as PipelineRepository, {
      load: vi.fn(async () => ({ skills: [{ skillId: "global", sourceInfo: { scope: "user" } }], diagnostics: [] })),
    } as unknown as SkillProvider, {} as Pick<AgentService, "execute">, { shortDrama: vi.fn() });

    await expect(service.update("project-a", { skillId: "global", disabled: false })).rejects.toMatchObject({ code: "SKILL_NOT_FOUND" });
  });

  it("installs the bundled short-drama example as a project Skill", async () => {
    const skills = {
      importLocal: vi.fn(),
      load: vi.fn(async () => ({ skills: [], diagnostics: [] })),
    } as unknown as SkillProvider;
    const source = { shortDrama: vi.fn(async () => "D:\\po-agent\\resources\\pipeline-skills\\short-drama") };
    const service = new PipelineSkillService({
      getProjectRoot: vi.fn(async () => "D:\\project-a"),
      getAgentConversation: vi.fn(async () => undefined),
    } as unknown as PipelineRepository, skills, {} as Pick<AgentService, "execute">, source);

    await service.installShortDrama("project-a");

    expect(skills.importLocal).toHaveBeenCalledWith({
      sourceFilePath: "D:\\po-agent\\resources\\pipeline-skills\\short-drama",
      scope: "project",
      cwd: "D:\\project-a",
    });
  });
});
