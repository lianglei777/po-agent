import type { CanvasAgentStage, CanvasAgentTurnIntent } from "@/contracts/pipeline-agent";
import { AppError } from "@/server/domain/app-error";

interface ActiveCanvasAgentTurnPolicy {
  turnId: string;
  intent: CanvasAgentTurnIntent;
  userMessage: string;
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
    this.active.set(sessionId, { turnId, intent, userMessage });
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
}
