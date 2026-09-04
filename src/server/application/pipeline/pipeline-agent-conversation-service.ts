import type {
  PipelineAgentTurnRequest,
  PipelineAgentTurnResponse,
  PipelineAgentConversationResponse,
  UpdatePipelineAgentConversationRequest,
} from "@/contracts/pipeline-agent";
import type { AgentService } from "@/server/application/agent-service";
import { AppError } from "@/server/domain/app-error";
import type { PipelineAgentConversation } from "@/server/domain/pipeline";
import type { PipelineRepository } from "@/server/ports/pipeline-repository";
import type { SessionRepository } from "@/server/ports/session-repository";
import type { CanvasAgentContextAssembler } from "./canvas-agent-context-assembler";
import { canvasAgentTurnPolicyContext, type CanvasAgentIntentResolver } from "./canvas-agent-intent-resolver";
import type { CanvasAgentTurnPolicyRegistry } from "./canvas-agent-turn-policy-registry";

export class PipelineAgentConversationService {
  private readonly pending = new Map<string, Promise<PipelineAgentConversationResponse>>();

  constructor(
    private readonly repository: PipelineRepository,
    private readonly agentService: Pick<AgentService, "create" | "execute" | "getState">,
    private readonly sessions: Pick<SessionRepository, "resolveStoragePath">,
    private readonly contextAssembler: CanvasAgentContextAssembler,
    private readonly intentResolver: CanvasAgentIntentResolver,
    private readonly turnPolicies: CanvasAgentTurnPolicyRegistry,
  ) {}

  async getOrCreate(projectId: string): Promise<PipelineAgentConversationResponse> {
    const current = this.pending.get(projectId);
    if (current) return current;
    const operation = this.loadOrCreate(projectId).finally(() => this.pending.delete(projectId));
    this.pending.set(projectId, operation);
    return operation;
  }

  async submitTurn(
    projectId: string,
    input: PipelineAgentTurnRequest,
  ): Promise<PipelineAgentTurnResponse> {
    const conversation = await this.getOrCreate(projectId);
    const canvasContext = await this.contextAssembler.assemble(projectId, {
      canvasRevision: input.canvasRevision,
      selectedNodeIds: input.selectedNodeIds,
      mentionedNodeIds: input.mentionedNodeIds ?? [],
    });
    const intent = await this.intentResolver.resolve({
      sessionId: conversation.sessionId,
      message: input.message,
      model: conversation.provider && conversation.modelId
        ? { provider: conversation.provider, modelId: conversation.modelId }
        : null,
      allowAgentGeneration: conversation.allowAgentGeneration,
      canvasContext,
    });
    this.turnPolicies.begin(conversation.sessionId, input.turnId, intent, input.message);
    try {
      await this.agentService.execute(
        conversation.sessionId,
        { type: "prompt", message: input.message },
        {
          trustedPromptContext: `${canvasContext}\n${canvasAgentTurnPolicyContext(intent)}`,
          onPromptSettled: () => this.turnPolicies.end(conversation.sessionId, input.turnId),
        },
      );
    } catch (error) {
      this.turnPolicies.end(conversation.sessionId, input.turnId);
      throw error;
    }
    return { accepted: true, intent };
  }

  async updateSettings(
    projectId: string,
    patch: UpdatePipelineAgentConversationRequest,
  ): Promise<PipelineAgentConversationResponse> {
    const conversation = await this.getOrCreate(projectId);
    let model: { provider: string; modelId: string } | undefined;
    if (patch.provider && patch.modelId) {
      await this.agentService.execute(conversation.sessionId, {
        type: "set_model",
        provider: patch.provider,
        modelId: patch.modelId,
      });
      model = { provider: patch.provider, modelId: patch.modelId };
    }
    const updated = await this.repository.updateAgentConversation(projectId, {
      ...(model ?? {}),
      ...(patch.allowAgentGeneration === undefined
        ? {}
        : { allowAgentGeneration: patch.allowAgentGeneration }),
    });
    if (!updated) {
      throw new AppError("PIPELINE_PROJECT_NOT_FOUND", "Pipeline project was not found", 404);
    }
    return toResponse(updated);
  }

  private async loadOrCreate(projectId: string): Promise<PipelineAgentConversationResponse> {
    const rootPath = await this.repository.getProjectRoot(projectId);
    if (!rootPath) {
      throw new AppError("PIPELINE_PROJECT_NOT_FOUND", "Pipeline project was not found", 404);
    }
    const existing = await this.repository.getAgentConversation(projectId);
    if (existing && await this.sessions.resolveStoragePath(existing.sessionId)) {
      try {
        const state = await this.agentService.getState(existing.sessionId);
        const synchronized = state.model &&
          (state.model.provider !== existing.provider || state.model.id !== existing.modelId)
          ? await this.repository.updateAgentConversation(projectId, {
              provider: state.model.provider,
              modelId: state.model.id,
            })
          : existing;
        return toResponse(synchronized ?? existing);
      } catch (error) {
        if (!hasErrorCode(error, "SESSION_NOT_FOUND")) throw error;
      }
    }

    const created = await this.agentService.create(
      { cwd: rootPath, toolNames: [] },
      { pipelineProjectId: projectId },
    );
    const state = await this.agentService.getState(created.sessionId);
    const conversation = await this.repository.upsertAgentConversation({
      projectId,
      sessionId: created.sessionId,
      provider: state.model?.provider ?? null,
      modelId: state.model?.id ?? null,
      allowAgentGeneration: existing?.allowAgentGeneration ?? false,
    });
    return toResponse(conversation);
  }
}

function toResponse(conversation: PipelineAgentConversation): PipelineAgentConversationResponse {
  return { ...conversation };
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null &&
    "code" in error && (error as { code?: unknown }).code === code;
}
