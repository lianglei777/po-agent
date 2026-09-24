import type { CanvasAgentStage, CanvasAgentTurnIntent } from "@/contracts/pipeline-agent";
import { AppError } from "@/server/domain/app-error";

interface ActiveCanvasAgentTurnPolicy {
  turnId: string;
  intent: CanvasAgentTurnIntent;
  userMessage: string;
  specialistCallKeys: Set<string>;
  failedSpecialists: Set<string>;
  authorizedNodeIds: Set<string>;
}

/**
 * 保存当前进程中正在执行的 Pipeline Agent 回合权限。
 * 持久化事实仍在 Session；这里仅封闭一次 tool loop 的授权窗口。
 */
export class CanvasAgentTurnPolicyRegistry {
  private readonly active = new Map<string, ActiveCanvasAgentTurnPolicy>();

  begin(sessionId: string, turnId: string, intent: CanvasAgentTurnIntent, userMessage = ""): void {
    if (this.active.has(sessionId)) {
      throw new AppError("AGENT_BUSY", "The Agent is already processing a turn", 409);
    }
    this.active.set(sessionId, {
      turnId,
      intent,
      userMessage,
      specialistCallKeys: new Set(),
      failedSpecialists: new Set(),
      authorizedNodeIds: new Set(intent.scope?.nodeIds ?? []),
    });
  }

  end(sessionId: string, turnId: string): void {
    if (this.active.get(sessionId)?.turnId === turnId) this.active.delete(sessionId);
  }

  get(sessionId: string): CanvasAgentTurnIntent | null {
    return this.active.get(sessionId)?.intent ?? null;
  }

  getActive(sessionId: string): ActiveCanvasAgentTurnPolicy | null {
    return this.active.get(sessionId) ?? null;
  }

  effectiveScope(sessionId: string): CanvasAgentTurnIntent["scope"] {
    const active = this.active.get(sessionId);
    const scope = active?.intent.scope;
    if (!active || !scope || scope.projectWide) return scope;
    return { projectWide: false, nodeIds: [...active.authorizedNodeIds] };
  }

  authorizeCreatedNodes(sessionId: string, nodeIds: string[]): void {
    const active = this.active.get(sessionId);
    if (!active) return;
    for (const nodeId of nodeIds) active.authorizedNodeIds.add(nodeId);
  }

  requireStage(sessionId: string, stage: CanvasAgentStage): CanvasAgentTurnIntent {
    const intent = this.get(sessionId);
    if (!intent?.allowedStages.includes(stage)) {
      throw new AppError(
        "PIPELINE_AGENT_ACTION_NOT_ALLOWED",
        `The current Agent turn does not allow the ${stage} stage`,
        403,
        { stage, intent: intent ?? undefined },
      );
    }
    return intent;
  }

  claimSpecialistCall(sessionId: string, specialist: string, callKey: string): void {
    const active = this.active.get(sessionId);
    if (!active) {
      throw new AppError("PIPELINE_AGENT_ACTION_NOT_ALLOWED", "No active Pipeline Agent turn can call a Specialist", 403);
    }
    if (active.failedSpecialists.has(specialist)) {
      throw new AppError(
        "PIPELINE_AGENT_ACTION_NOT_ALLOWED",
        "This Specialist already failed in the current turn; preserve completed work and report the original error",
        409,
        { reason: "specialist-already-failed", specialist },
      );
    }
    if (active.specialistCallKeys.has(callKey)) {
      throw new AppError(
        "PIPELINE_AGENT_ACTION_NOT_ALLOWED",
        "The same Specialist range was already attempted in this turn; report the original result instead of retrying",
        409,
        { reason: "specialist-range-already-attempted" },
      );
    }
    active.specialistCallKeys.add(callKey);
  }

  markSpecialistFailure(sessionId: string, specialist: string): void {
    this.active.get(sessionId)?.failedSpecialists.add(specialist);
  }
}
