import { describe, expect, it, vi } from "vitest";
import type {
  AgentRuntime,
  CreateRuntimeInput,
} from "@/server/ports/agent-runtime";
import type { SessionRepository } from "@/server/ports/session-repository";
import { InMemoryAgentRegistry } from "@/server/infrastructure/runtime/in-memory-agent-registry";
import { AgentService } from "./agent-service";
import { GenerationReviewRegistry } from "./content-generation/generation-review-registry";

describe("AgentService", () => {
  it("creates and configures a runtime without starting a prompt", async () => {
    const commands: unknown[] = [];
    const execute = async <T,>(command: unknown) => {
      commands.push(command);
      return undefined as T;
    };
    const runtime = runtimeStub({ execute });
    const registry = new InMemoryAgentRegistry();
    const service = new AgentService(
      {} as SessionRepository,
      registry,
      { create: vi.fn(async () => runtime) },
      { listRoots: async () => [], addRoot: vi.fn() },
    );

    await expect(
      service.create({
        cwd: "C:\\work",
        provider: "provider",
        modelId: "model",
        thinkingLevel: "high",
        toolNames: ["read"],
      }),
    ).resolves.toEqual({ sessionId: "created" });

    expect(commands).toEqual([
      { type: "set_model", provider: "provider", modelId: "model" },
      { type: "set_thinking_level", level: "high" },
      { type: "set_tools", toolNames: ["read"] },
    ]);
  });

  it("binds project tools to the requested session id on create", async () => {
    const runtime = runtimeStub();
    const create = vi
      .fn<(input: CreateRuntimeInput) => Promise<AgentRuntime>>()
      .mockResolvedValue(runtime);
    const getTools = vi
      .fn<(input: { sessionId: string; cwd: string }) => []>()
      .mockReturnValue([]);
    const service = new AgentService(
      {} as SessionRepository,
      new InMemoryAgentRegistry(),
      { create },
      { listRoots: async () => [], addRoot: vi.fn() },
      { getTools },
    );

    await service.create({ cwd: "C:\\work" });

    const requestedSessionId = create.mock.calls[0]?.[0].requestedSessionId;
    expect(requestedSessionId).toEqual(expect.any(String));
    expect(getTools).toHaveBeenCalledWith({
      sessionId: requestedSessionId,
      cwd: "C:\\work",
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      requestedSessionId,
      customTools: [],
    }));
  });

  it("restores Pipeline sessions with their project scope and without built-in tools", async () => {
    const runtime = runtimeStub();
    const create = vi
      .fn<(input: CreateRuntimeInput) => Promise<AgentRuntime>>()
      .mockResolvedValue(runtime);
    const getTools = vi.fn().mockReturnValue([]);
    const loadSkills = vi.fn(async () => ({ skills: [], diagnostics: [] }));
    const sessions = {
      findById: vi.fn(async () => ({
        filePath: "C:\\work\\session.jsonl",
        info: { cwd: "C:\\work" },
      })),
    } as unknown as SessionRepository;
    const service = new AgentService(
      sessions,
      new InMemoryAgentRegistry(),
      { create },
      { listRoots: async () => [], addRoot: vi.fn() },
      { getTools },
      undefined,
      undefined,
      undefined,
      { getPipelineProjectId: vi.fn(async () => "project-1") },
      { load: loadSkills },
    );

    await service.getState("session-1");

    expect(getTools).toHaveBeenCalledWith({
      sessionId: "session-1",
      cwd: "C:\\work",
      pipelineProjectId: "project-1",
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      requestedSessionId: "session-1",
      toolNames: [],
      customTools: [],
      excludedSkillNames: ["image-generation", "video-generation"],
    }));
    expect(loadSkills).not.toHaveBeenCalled();
  });

  it("creates Pipeline sessions without loading external Chat generation Skills", async () => {
    const runtime = runtimeStub();
    const create = vi.fn(async () => runtime);
    const loadSkills = vi.fn(async () => ({ skills: [], diagnostics: [] }));
    const service = new AgentService(
      {} as SessionRepository,
      new InMemoryAgentRegistry(),
      { create },
      { listRoots: async () => [], addRoot: vi.fn() },
      { getTools: vi.fn(() => []) },
      undefined,
      undefined,
      undefined,
      undefined,
      { load: loadSkills },
    );

    await service.create(
      { cwd: "C:\\work", toolNames: [] },
      { pipelineProjectId: "project-1" },
    );

    expect(loadSkills).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      excludedSkillNames: ["image-generation", "video-generation"],
    }));
  });

  it("destroys the original runtime after a successful fork", async () => {
    const destroy = vi.fn();
    const runtime: AgentRuntime = {
      sessionId: "original",
      sessionFile: "original.jsonl",
      isAlive: () => true,
      execute: async <T,>() =>
        ({
          sessionId: "forked",
          sessionFile: "forked.jsonl",
        }) as T,
      getState: async () => ({
        sessionId: "original",
        sessionFile: "original.jsonl",
        isStreaming: false,
        isCompacting: false,
        autoRetryEnabled: true,
        contextUsage: null,
        systemPrompt: "",
        thinkingLevel: "off",
      }),
      subscribe: () => () => {},
      invalidateModelConfig: () => {},
      invalidateWebAccessConfig: () => {},
      reloadAgentSettings: async () => {},
      destroy,
    };
    const registry = new InMemoryAgentRegistry();
    registry.register("original", runtime);
    const service = new AgentService(
      {} as SessionRepository,
      registry,
      { create: vi.fn() },
      { listRoots: async () => [], addRoot: vi.fn() },
    );

    await expect(
      service.execute("original", {
        type: "fork",
        entryId: "entry-1",
      }),
    ).resolves.toEqual({
      sessionId: "forked",
      sessionFile: "forked.jsonl",
    });

    expect(destroy).toHaveBeenCalledOnce();
    expect(registry.get("original")).toBeUndefined();
  });

  it("scopes Skill generation authorization to the active prompt execution", async () => {
    let finishPrompt: (() => void) | undefined;
    const runtime = runtimeStub({
      execute: async <T,>() =>
        new Promise<T>((resolve) => {
          finishPrompt = () => resolve(undefined as T);
        }),
    });
    const runtimes = new InMemoryAgentRegistry();
    runtimes.register("session-1", runtime);
    const reviews = new GenerationReviewRegistry();
    const service = new AgentService(
      { findById: vi.fn(async () => ({ info: { cwd: "C:\\work" } })) } as unknown as SessionRepository,
      runtimes,
      { create: vi.fn() },
      { listRoots: async () => [], addRoot: vi.fn() },
      undefined,
      reviews,
      undefined,
      undefined,
      undefined,
      { load: vi.fn(async () => ({
        skills: [{
          skillId: "image-generation",
          name: "image-generation",
          description: "Generate images",
          filePath: "C:\\work\\.pi\\skills\\image-generation\\SKILL.md",
          displayPath: ".pi/skills/image-generation/SKILL.md",
          baseDir: "C:\\work\\.pi\\skills\\image-generation",
          sourceInfo: {
            path: "C:\\work\\.pi\\skills\\image-generation\\SKILL.md",
            source: "project",
            scope: "project" as const,
            origin: "top-level" as const,
          },
          canModify: true,
          disableModelInvocation: false,
          version: "1",
        }],
        diagnostics: [],
      })) },
    );

    await service.execute("session-1", {
      type: "prompt",
      message: "Generate with review",
    });
    expect(reviews.current("session-1")?.allowedToolNames).toEqual(
      new Set(["generate_image"]),
    );

    finishPrompt?.();
    await vi.waitFor(() =>
      expect(reviews.requiresReview("session-1")).toBe(false),
    );
  });

  it("releases the prompt reservation when Skill policy loading fails", async () => {
    const runtime = runtimeStub();
    const runtimes = new InMemoryAgentRegistry();
    runtimes.register("session-1", runtime);
    const load = vi.fn()
      .mockRejectedValueOnce(new Error("skill load failed"))
      .mockResolvedValue({ skills: [], diagnostics: [] });
    const service = new AgentService(
      { findById: vi.fn(async () => ({ info: { cwd: "C:\\work" } })) } as unknown as SessionRepository,
      runtimes,
      { create: vi.fn() },
      { listRoots: async () => [], addRoot: vi.fn() },
      undefined,
      new GenerationReviewRegistry(),
      undefined,
      undefined,
      undefined,
      { load },
    );

    await expect(service.execute("session-1", {
      type: "prompt",
      message: "first",
    })).rejects.toThrow("skill load failed");
    await expect(service.execute("session-1", {
      type: "prompt",
      message: "second",
    })).resolves.toEqual({ accepted: true });
  });

  it("does not apply external Chat generation Skills to Pipeline prompts", async () => {
    let finishPrompt: (() => void) | undefined;
    const runtime = runtimeStub({
      execute: async <T,>() =>
        new Promise<T>((resolve) => {
          finishPrompt = () => resolve(undefined as T);
        }),
    });
    const runtimes = new InMemoryAgentRegistry();
    runtimes.register("pipeline-session", runtime);
    const reviews = new GenerationReviewRegistry();
    const getPromptContext = vi.fn(async () => undefined);
    const load = vi.fn(async () => ({
      skills: [{
        skillId: "image-generation",
        name: "image-generation",
        description: "Generate images",
        filePath: "C:\\work\\.pi\\skills\\image-generation\\SKILL.md",
        displayPath: ".pi/skills/image-generation/SKILL.md",
        baseDir: "C:\\work\\.pi\\skills\\image-generation",
        sourceInfo: {
          path: "C:\\work\\.pi\\skills\\image-generation\\SKILL.md",
          source: "project",
          scope: "project" as const,
          origin: "top-level" as const,
        },
        canModify: true,
        disableModelInvocation: false,
        version: "1",
      }],
      diagnostics: [],
    }));
    const service = new AgentService(
      {} as SessionRepository,
      runtimes,
      { create: vi.fn() },
      { listRoots: async () => [], addRoot: vi.fn() },
      undefined,
      reviews,
      { getPromptContext },
      undefined,
      { getPipelineProjectId: vi.fn(async () => "project-1") },
      { load },
    );

    await service.execute("pipeline-session", {
      type: "prompt",
      message: "Prepare the canvas",
    });

    expect(load).not.toHaveBeenCalled();
    expect(reviews.current("pipeline-session")).toBeUndefined();
    expect(getPromptContext).toHaveBeenCalledWith(
      "pipeline-session",
      undefined,
    );
    finishPrompt?.();
  });

  it("reserves a session before the runtime reports streaming", async () => {
    let finishPrompt: (() => void) | undefined;
    const runtime = runtimeStub({
      execute: async <T,>() =>
        new Promise<T>((resolve) => {
          finishPrompt = () => resolve(undefined as T);
        }),
    });
    const runtimes = new InMemoryAgentRegistry();
    runtimes.register("session-1", runtime);
    const service = new AgentService(
      {} as SessionRepository,
      runtimes,
      { create: vi.fn() },
      { listRoots: async () => [], addRoot: vi.fn() },
    );

    await service.execute("session-1", { type: "prompt", message: "first" });
    await expect(service.getState("session-1")).resolves.toMatchObject({
      isStreaming: true,
    });
    await expect(
      service.execute("session-1", { type: "prompt", message: "second" }),
    ).rejects.toMatchObject({ code: "AGENT_BUSY", status: 409 });

    finishPrompt?.();
    await vi.waitFor(async () =>
      expect(await service.getState("session-1")).toMatchObject({
        isStreaming: false,
      }),
    );
  });

  it("projects a new runtime before returning it to dependent session APIs", async () => {
    const runtime = runtimeStub();
    const registerCreatedSession = vi.fn(async () => {});
    const service = new AgentService(
      {} as SessionRepository,
      new InMemoryAgentRegistry(),
      { create: vi.fn(async () => runtime) },
      { listRoots: async () => [], addRoot: vi.fn() },
      undefined,
      undefined,
      undefined,
      { registerCreatedSession },
    );

    await expect(service.create({ cwd: "C:\\work" })).resolves.toEqual({
      sessionId: "created",
    });
    expect(registerCreatedSession).toHaveBeenCalledWith({
      sessionId: "created",
      cwd: "C:\\work",
      sessionFile: "created.jsonl",
      createdAt: expect.any(String),
    });
  });

  it("destroys a new runtime when its persistent session projection fails", async () => {
    const destroy = vi.fn();
    const runtime = runtimeStub({ destroy });
    const registry = new InMemoryAgentRegistry();
    const service = new AgentService(
      {} as SessionRepository,
      registry,
      { create: vi.fn(async () => runtime) },
      { listRoots: async () => [], addRoot: vi.fn() },
      undefined,
      undefined,
      undefined,
      {
        registerCreatedSession: vi.fn(async () => {
          throw new Error("projection failed");
        }),
      },
    );

    await expect(service.create({ cwd: "C:\\work" })).rejects.toThrow(
      "projection failed",
    );
    expect(destroy).toHaveBeenCalledOnce();
    expect(registry.get("created")).toBeUndefined();
  });

  it("merges server-owned audit and canvas context into a prompt", async () => {
    const commands: unknown[] = [];
    const onPromptSettled = vi.fn();
    const execute = async <T,>(command: unknown) => {
      commands.push(command);
      return undefined as T;
    };
    const runtime = runtimeStub({ execute });
    const runtimes = new InMemoryAgentRegistry();
    runtimes.register("session-1", runtime);
    const service = new AgentService(
      {} as SessionRepository,
      runtimes,
      { create: vi.fn() },
      { listRoots: async () => [], addRoot: vi.fn() },
      undefined,
      undefined,
      { getPromptContext: vi.fn(async () => "trusted run audit") },
    );

    await service.execute(
      "session-1",
      {
        type: "prompt",
        message: "Why did the previous image look unchanged?",
      },
      { trustedPromptContext: "trusted canvas state", onPromptSettled },
    );

    await vi.waitFor(() => expect(commands).toContainEqual({
      type: "prompt",
      message: "Why did the previous image look unchanged?",
      generationContext: "trusted run audit\ntrusted canvas state",
    }));
    await vi.waitFor(() => expect(onPromptSettled).toHaveBeenCalledOnce());
  });
});

function runtimeStub(
  overrides: Partial<AgentRuntime> = {},
): AgentRuntime {
  return {
    sessionId: "created",
    sessionFile: "created.jsonl",
    isAlive: () => true,
    invalidateModelConfig: () => {},
    invalidateWebAccessConfig: () => {},
    reloadAgentSettings: async () => {},
    execute: async <T,>() => undefined as T,
    getState: async () => ({
      sessionId: "created",
      sessionFile: "created.jsonl",
      isStreaming: false,
      isCompacting: false,
      autoRetryEnabled: true,
      contextUsage: null,
      systemPrompt: "",
      thinkingLevel: "off",
    }),
    subscribe: () => () => {},
    destroy: () => {},
    ...overrides,
  };
}
