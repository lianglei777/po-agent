import { describe, expect, it, vi } from "vitest";
import type { CanvasContinuityBible } from "@/server/domain/pipeline";
import type { PipelineRepository } from "@/server/ports/pipeline-repository";
import { CanvasAgentTurnPolicyRegistry } from "./canvas-agent-turn-policy-registry";
import { CanvasContinuityService } from "./canvas-continuity-service";

describe("CanvasContinuityService", () => {
  it("persists a user-confirmed fact and updates the same labeled entry", async () => {
    let bible: CanvasContinuityBible | null = null;
    const repository = {
      getCanvasAssetAnalysis: vi.fn(async () => null),
      getCanvasContinuityBible: vi.fn(async () => bible),
      saveCanvasContinuityBible: vi.fn(async (input) => (bible = input)),
    } as unknown as PipelineRepository;
    const policies = policy("记住主角穿红色夹克");
    const service = new CanvasContinuityService(repository, policies);
    const first = await service.update({ projectId: "project-1", sessionId: "session-1", operations: [{
      type: "upsert", category: "wardrobe", label: "主角外套", value: "红色夹克", confirmationQuote: "主角穿红色夹克",
    }] });
    expect(first).toMatchObject({ revision: 1, entries: [{ value: "红色夹克" }] });

    policies.end("session-1", "turn-1");
    policies.begin("session-1", "turn-2", intent(), "把主角外套改为黑色夹克");
    const second = await service.update({ projectId: "project-1", sessionId: "session-1", operations: [{
      type: "upsert", category: "wardrobe", label: "主角外套", value: "黑色夹克", confirmationQuote: "主角外套改为黑色夹克",
    }] });
    expect(second.revision).toBe(2);
    expect(second.entries).toHaveLength(1);
    expect(second.entries[0]?.value).toBe("黑色夹克");
  });

  it("rejects a model-invented confirmation quote", async () => {
    const repository = {
      getCanvasAssetAnalysis: vi.fn(async () => null),
      getCanvasContinuityBible: vi.fn(async () => null),
    } as unknown as PipelineRepository;
    const service = new CanvasContinuityService(repository, policy("分析一下这张图"));
    await expect(service.update({ projectId: "project-1", sessionId: "session-1", operations: [{
      type: "upsert", category: "style", label: "风格", value: "赛博朋克", confirmationQuote: "确认赛博朋克风格",
    }] })).rejects.toMatchObject({ code: "PIPELINE_AGENT_ACTION_NOT_ALLOWED" });
  });
});

function policy(message: string) {
  const policies = new CanvasAgentTurnPolicyRegistry();
  policies.begin("session-1", "turn-1", intent(), message);
  return policies;
}

function intent() {
  return { type: "resolved" as const, objective: "更新设定", requestedStage: "discuss" as const,
    effectiveStage: "discuss" as const, allowedStages: ["discuss" as const],
    generationPermission: "not-requested" as const, confidence: "high" as const };
}
