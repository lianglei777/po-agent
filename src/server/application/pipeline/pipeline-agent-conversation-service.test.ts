import { describe, expect, it, vi } from "vitest";
import type { AgentService } from "@/server/application/agent-service";
import type { PipelineAgentConversation } from "@/server/domain/pipeline";
import type { PipelineRepository } from "@/server/ports/pipeline-repository";
import type { SessionRepository } from "@/server/ports/session-repository";
import { PipelineAgentConversationService } from "./pipeline-agent-conversation-service";
import { CanvasAgentTurnPolicyRegistry } from "./canvas-agent-turn-policy-registry";

describe("PipelineAgentConversationService", () => {
  it("reuses the project's conversation and does not create another session", async () => {
    const conversation = savedConversation();
  const repository = {
      getProjectRoot: vi.fn(async () => "D:\\project"),
      getAgentConversation: vi.fn(async () => conversation),
      updateAgentConversation: vi.fn(),
    } as unknown as PipelineRepository;
  const agent = {
      create: vi.fn(),
      execute: vi.fn(),
      getState: vi.fn(async () => runtimeState()),
    } satisfies Pick<AgentService, "create" | "execute" | "getState">;

  const service = createService(repository, agent, { resolveStoragePath: vi.fn(async () => "session.jsonl") });
    await expect(service.getOrCreate("project-1")).resolves.toEqual(conversation);
    expect(agent.create).not.toHaveBeenCalled();
  });

  it("creates a project-scoped session once for concurrent requests", async () => {
    let stored: PipelineAgentConversation | null = null;
    const repository = {
      getProjectRoot: vi.fn(async () => "D:\\project"),
      getAgentConversation: vi.fn(async () => stored),
      upsertAgentConversation: vi.fn(async (input) => {
        stored = { ...input, createdAt: "now", updatedAt: "now" };
        return stored;
      }),
    } as unknown as PipelineRepository;
    const agent = {
      create: vi.fn(async () => ({ sessionId: "session-new" })),
      execute: vi.fn(),
      getState: vi.fn(async () => runtimeState()),
    } satisfies Pick<AgentService, "create" | "execute" | "getState">;
    const service = createService(repository, agent);

    const [first, second] = await Promise.all([
      service.getOrCreate("project-1"),
      service.getOrCreate("project-1"),
    ]);

    expect(first.sessionId).toBe("session-new");
    expect(second).toEqual(first);
    expect(agent.create).toHaveBeenCalledTimes(1);
    expect(agent.create).toHaveBeenCalledWith(
      { cwd: "D:\\project", toolNames: [] },
      { pipelineProjectId: "project-1" },
    );
  });

  it("replaces a conversation whose live runtime has no persisted session file", async () => {
    const conversation = savedConversation();
    const replacement = { ...conversation, sessionId: "session-replacement" };
    const repository = {
      getProjectRoot: vi.fn(async () => "D:\\project"),
      getAgentConversation: vi.fn(async () => conversation),
      upsertAgentConversation: vi.fn(async () => replacement),
    } as unknown as PipelineRepository;
    const agent = {
      create: vi.fn(async () => ({ sessionId: replacement.sessionId })),
      execute: vi.fn(),
      getState: vi.fn(async () => runtimeState()),
    } satisfies Pick<AgentService, "create" | "execute" | "getState">;

    const result = await createService(repository, agent, { resolveStoragePath: vi.fn(async () => null) })
      .getOrCreate("project-1");

    expect(result.sessionId).toBe(replacement.sessionId);
    expect(agent.getState).toHaveBeenCalledWith(replacement.sessionId);
    expect(agent.create).toHaveBeenCalledTimes(1);
  });

  it("submits a turn with trusted canvas context to the owning session", async () => {
    const conversation = savedConversation();
    const repository = {
      getProjectRoot: vi.fn(async () => "D:\\project"),
      getAgentConversation: vi.fn(async () => conversation),
    } as unknown as PipelineRepository;
    const promptLifecycle: { onSettled?: () => void } = {};
    const agent = {
      create: vi.fn(),
      execute: vi.fn(async (
        _sessionId: string,
        _command: Parameters<AgentService["execute"]>[1],
        options?: Parameters<AgentService["execute"]>[2],
      ) => {
        promptLifecycle.onSettled = options?.onPromptSettled;
        return { accepted: true as const };
      }),
      getState: vi.fn(async () => runtimeState()),
    } satisfies Pick<AgentService, "create" | "execute" | "getState">;
    const contextAssembler = {
      assemble: vi.fn(async () => "<canvas-agent-context>trusted</canvas-agent-context>"),
    };
    const intent = resolvedIntent();
    const intentResolver = { resolve: vi.fn(async () => intent) };
    const policies = new CanvasAgentTurnPolicyRegistry();
  const service = new PipelineAgentConversationService(
    repository,
    agent,
    { resolveStoragePath: vi.fn(async () => "session.jsonl") },
      contextAssembler as never,
      intentResolver as never,
      policies,
    );

    await expect(service.submitTurn("project-1", {
      turnId: "turn-123",
      message: "分析这些节点",
      canvasRevision: 4,
      selectedNodeIds: ["node-1"],
      mentionedNodeIds: ["node-2"],
    })).resolves.toEqual({ accepted: true, intent });

    expect(agent.execute).toHaveBeenCalledWith(
      "session-1",
      { type: "prompt", message: "分析这些节点" },
      {
        trustedPromptContext: expect.stringContaining("<canvas-agent-turn-policy>"),
        onPromptSettled: expect.any(Function),
      },
    );
    expect(policies.get("session-1")).toEqual(intent);
    promptLifecycle.onSettled?.();
    expect(policies.get("session-1")).toBeNull();
  });
});

function createService(
  repository: PipelineRepository,
  agent: Pick<AgentService, "create" | "execute" | "getState">,
  sessions: Pick<SessionRepository, "resolveStoragePath"> = { resolveStoragePath: async () => "session.jsonl" },
) {
  return new PipelineAgentConversationService(
    repository,
    agent,
    sessions,
    {} as never,
    {} as never,
    new CanvasAgentTurnPolicyRegistry(),
  );
}

function resolvedIntent() {
  return {
    type: "resolved" as const,
    objective: "分析节点",
    requestedStage: "discuss" as const,
    effectiveStage: "discuss" as const,
    allowedStages: ["discuss" as const],
    generationPermission: "not-requested" as const,
    confidence: "high" as const,
  };
}

function savedConversation(): PipelineAgentConversation {
  return {
    projectId: "project-1",
    sessionId: "session-1",
    provider: "openai",
    modelId: "model-1",
    allowAgentGeneration: false,
    createdAt: "now",
    updatedAt: "now",
  };
}

function runtimeState() {
  return {
    sessionId: "session-1",
    sessionFile: "session.jsonl",
    isStreaming: false,
    isCompacting: false,
    autoRetryEnabled: false,
    model: { provider: "openai", id: "model-1" },
    contextUsage: null,
    systemPrompt: "",
    thinkingLevel: "off" as const,
  };
}
