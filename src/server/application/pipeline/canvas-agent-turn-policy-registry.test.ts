import { describe, expect, it } from "vitest";
import { CanvasAgentTurnPolicyRegistry } from "./canvas-agent-turn-policy-registry";

describe("CanvasAgentTurnPolicyRegistry", () => {
  it("enforces the active turn scope and rejects concurrent turns", () => {
    const registry = new CanvasAgentTurnPolicyRegistry();
    const intent = {
      type: "resolved" as const,
      objective: "写剧本",
      requestedStage: "script" as const,
      effectiveStage: "script" as const,
      allowedStages: ["discuss" as const, "script" as const],
      generationPermission: "not-requested" as const,
      confidence: "high" as const,
    };
    registry.begin("session-1", "turn-1", intent);

    expect(registry.requireStage("session-1", "script")).toEqual(intent);
    expect(() => registry.requireStage("session-1", "generate"))
      .toThrowError(expect.objectContaining({ code: "PIPELINE_AGENT_ACTION_NOT_ALLOWED" }));
    expect(() => registry.begin("session-1", "turn-2", intent))
      .toThrowError(expect.objectContaining({ code: "AGENT_BUSY" }));

    registry.end("session-1", "stale-turn");
    expect(registry.get("session-1")).toEqual(intent);
    registry.end("session-1", "turn-1");
    expect(registry.get("session-1")).toBeNull();
  });
});
