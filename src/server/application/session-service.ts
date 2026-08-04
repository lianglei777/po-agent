import { AppError } from "@/server/domain/app-error";
import type { AgentRuntimeRegistry } from "@/server/ports/agent-runtime";
import type { SessionRepository } from "@/server/ports/session-repository";
import type { ContentGenerationService } from "./content-generation-service";

export class SessionService {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly runtimes: AgentRuntimeRegistry,
    private readonly contentGeneration?: ContentGenerationService,
  ) {}

  async list() {
    const [agentSessions, contentSessions] = await Promise.all([
      this.sessions.list(),
      this.contentGeneration?.listSessionInfo() ?? [],
    ]);
    return [...agentSessions, ...contentSessions].sort((left, right) =>
      right.modified.localeCompare(left.modified),
    );
  }

  async get(
    sessionId: string,
    options?: { includeRuntimeState?: boolean },
  ) {
    const detail = await this.sessions.findById(sessionId);
    if (!detail) return null;
    if (options?.includeRuntimeState) {
      const runtime = this.runtimes.get(sessionId);
      detail.agentState = runtime
        ? { loaded: true, state: await runtime.getState() }
        : { loaded: false };
    }
    return detail;
  }

  getContext(sessionId: string, leafId?: string | null) {
    return this.sessions.getContext(sessionId, leafId);
  }

  async rename(sessionId: string, name: string): Promise<void> {
    if (!name.trim()) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Session name is required",
        400,
      );
    }
    if (await this.contentGeneration?.renameSession(sessionId, name)) return;
    await this.sessions.rename(sessionId, name.trim());
  }

  async delete(sessionId: string): Promise<void> {
    if (await this.contentGeneration?.deleteSession(sessionId)) return;
    this.runtimes.destroy(sessionId);
    await this.sessions.deleteAndReparent(sessionId);
  }
}

