import type {
  GenerationRouteDto,
  JsonValue,
  PlanGenerationTurnRequest,
  PlanGenerationTurnResponse,
} from "@/contracts/generation";
import type {
  GenerationIntentClassifier,
  GenerationIntentContextMessage,
  GenerationIntentRunSummary,
} from "@/server/ports/generation-intent-classifier";

export async function planGenerationTurn(
  input: PlanGenerationTurnRequest,
  routes: GenerationRouteDto[],
  classifier: GenerationIntentClassifier,
  context: {
    conversation: GenerationIntentContextMessage[];
    recentRuns: GenerationIntentRunSummary[];
  },
): Promise<PlanGenerationTurnResponse> {
  const decision = await classifier.classify({
    model: input.model,
    message: input.message.trim(),
    assets: input.assets,
    routes,
    ...context,
  });
  if (decision.intent === "chat") return { type: "chat" };
  if (decision.intent === "attachment-understanding") {
    return { type: "attachment-understanding" };
  }
  if (decision.intent === "clarification" || !decision.capability) {
    return {
      type: "clarification",
      reason: "AMBIGUOUS_INTENT",
      question: decision.question,
    };
  }

  const candidates = routes.filter(
    (route) => route.enabled && route.capability === decision.capability,
  );
  if (input.mode.type === "generation-route") {
    const selectedRouteId = input.mode.routeId;
    const selected = routes.find((route) => route.id === selectedRouteId);
    if (!selected) {
      return { type: "invalid", message: "Selected generation API is unavailable" };
    }
    if (selected.capability !== decision.capability) {
      return {
        type: "clarification",
        reason: "GENERATION_ROUTE_MISMATCH",
        question: decision.question,
        suggestedRoute: candidates.find((route) => route.isDefault) ?? candidates[0],
      };
    }
    return generationPlan(selected, input.message, decision.effectivePrompt, decision.parameters);
  }

  // 模型只提供候选建议；服务端仍验证启用状态和 capability，非法建议回退到稳定默认 Route。
  const suggested = decision.routeId
    ? candidates.find((candidate) => candidate.id === decision.routeId)
    : undefined;
  const route = suggested
    ?? candidates.find((candidate) => candidate.isDefault)
    ?? candidates[0];
  if (!route) {
    return { type: "invalid", message: `No enabled API supports ${decision.capability}` };
  }
  return generationPlan(route, input.message, decision.effectivePrompt, decision.parameters);
}

function generationPlan(
  route: GenerationRouteDto,
  originalMessage: string,
  effectivePrompt: string | undefined,
  candidateParameters: Record<string, JsonValue> | undefined,
): PlanGenerationTurnResponse {
  const allowedKeys = new Set(
    (route.inputSchema.parameters ?? []).map((field) => field.key),
  );
  const parameters = Object.fromEntries(
    Object.entries(candidateParameters ?? {}).filter(([key]) => allowedKeys.has(key)),
  );
  return {
    type: "generation",
    route,
    effectivePrompt: effectivePrompt?.trim() || originalMessage.trim(),
    parameters,
  };
}
