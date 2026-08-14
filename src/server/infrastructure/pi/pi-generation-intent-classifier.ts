import type { AssistantMessage, JsonValue as PiJsonValue } from "@earendil-works/pi-ai";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type {
  GenerationIntentClassifier,
  GenerationIntentDecision,
} from "@/server/ports/generation-intent-classifier";
import { AppError } from "@/server/domain/app-error";
import { GENERATION_CAPABILITIES } from "@/contracts/generation";

const SYSTEM_PROMPT = `You are the turn planner for a chat application that can optionally call paid content-generation APIs.
Decide the user's CURRENT intent using the full conversation and recent generation runs.

Rules:
- "chat": questions, explanations, critique, troubleshooting, comparisons, or discussion about a previous generated result. A complaint such as "why is this identical" is chat, never a new generation request.
- "generation": only when the user clearly asks to create, transform, animate, or regenerate media now.
- "clarification": use when generation may be intended but the desired output or transformation is genuinely unclear.
- An attached asset alone does not prove generation intent.
- Resolve references such as "it", "that image", or a named character from conversation context.
- For generation, write effectivePrompt as a self-contained instruction for the selected media API. Preserve all concrete user constraints and relevant context. Do not invent major creative requirements.
- Keep effectivePrompt under 1200 Chinese characters or 2400 Latin characters.
- Choose exactly one capability from the supplied routes. Return only parameters declared by routes supporting that capability.
- Return one JSON object and no markdown.

Schema:
{"intent":"chat|generation|clarification","capability":"text-to-image|image-to-image|text-to-video|image-to-video|multimodal-to-video","effectivePrompt":"string","parameters":{},"question":"string"}`;

export class PiGenerationIntentClassifier implements GenerationIntentClassifier {
  constructor(private readonly runtime: Promise<ModelRuntime>) {}

  async classify(
    input: Parameters<GenerationIntentClassifier["classify"]>[0],
  ): Promise<GenerationIntentDecision> {
    const runtime = await this.runtime;
    const model = runtime.getModel(input.model.provider, input.model.modelId);
    if (!model) {
      throw new AppError(
        "MODEL_NOT_FOUND",
        "The selected chat model is unavailable for intent planning",
        409,
      );
    }
    const payload = JSON.stringify({
      currentMessage: input.message,
      attachments: input.assets,
      recentConversation: input.conversation,
      recentGenerationRuns: input.recentRuns,
      availableRoutes: input.routes.map((route) => ({
        id: route.id,
        capability: route.capability,
        parameterSchema: route.inputSchema.parameters ?? [],
        assetSchema: route.inputSchema.assets ?? [],
      })),
    });
    const first = await complete(runtime, model, SYSTEM_PROMPT, payload);
    const decision = parseGenerationIntentDecision(messageText(first));
    if (decision && hasUsableGenerationPrompt(decision)) return decision;

    // 部分兼容模型会输出 Markdown、思考内容、截断 JSON 或省略号占位 Prompt；仅在协议失败时做一次低成本纠正重试。
    const repaired = await complete(
      runtime,
      model,
      `${SYSTEM_PROMPT}\nYour previous response was not a usable intent plan. Return one compact JSON object only. For generation, effectivePrompt must be a complete, self-contained instruction grounded in the supplied conversation; never return placeholders such as "...", "string", or an omitted prompt. Do not explain or repeat the schema.`,
      payload,
    );
    const repairedDecision = parseGenerationIntentDecision(messageText(repaired));
    return repairedDecision && hasUsableGenerationPrompt(repairedDecision)
      ? repairedDecision
      : { intent: "clarification" };
  }
}

function hasUsableGenerationPrompt(decision: GenerationIntentDecision): boolean {
  if (decision.intent !== "generation") return true;
  const prompt = decision.effectivePrompt?.trim() ?? "";
  if (prompt.length < 5 || !/[\p{L}\p{N}]/u.test(prompt)) return false;
  return !new Set(["string", "prompt", "effectiveprompt", "todo", "n/a"])
    .has(prompt.toLowerCase());
}

async function complete(
  runtime: ModelRuntime,
  model: NonNullable<ReturnType<ModelRuntime["getModel"]>>,
  systemPrompt: string,
  payload: string,
) {
  const response = await runtime.completeSimple(
    model,
    {
      systemPrompt,
      messages: [{ role: "user", timestamp: Date.now(), content: payload }],
    },
    { maxTokens: 2_000 },
  );
  if (response.stopReason === "error" || response.stopReason === "aborted") {
    throw new AppError(
      "INTERNAL_ERROR",
      response.errorMessage ?? "Intent planning failed",
      502,
    );
  }
  return response;
}

function messageText(response: AssistantMessage): string {
  return response.content.flatMap((block) => {
    if (block.type === "text") return [block.text];
    if (block.type === "thinking") return [block.thinking];
    if (block.type === "toolCall") return [JSON.stringify(block.arguments)];
    return [];
  }).join("\n");
}

export function parseGenerationIntentDecision(
  text: string,
): GenerationIntentDecision | null {
  const candidates = jsonObjectCandidates(text);
  for (const candidate of candidates.reverse()) {
    let value: PiJsonValue;
    try {
      value = JSON.parse(candidate) as PiJsonValue;
    } catch {
      continue;
    }
    const decision = decisionFromJson(value);
    if (decision) return decision;
  }
  return null;
}

function decisionFromJson(value: PiJsonValue): GenerationIntentDecision | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  for (const key of ["decision", "plan", "result", "output"] as const) {
    if (key in value) {
      const nested = decisionFromJson(value[key]);
      if (nested) return nested;
    }
  }
  const rawIntent = value.intent ?? value.type;
  const intent = rawIntent === "normal-chat" ? "chat"
    : rawIntent === "content-generation" || rawIntent === "generate" ? "generation"
    : rawIntent === "ambiguous" ? "clarification"
    : rawIntent;
  if (intent !== "chat" && intent !== "generation" && intent !== "clarification") {
    return null;
  }
  if (intent === "chat") return { intent };
  const question = typeof value.question === "string" ? value.question : undefined;
  if (intent === "clarification") return { intent, question };
  const rawCapability = typeof value.capability === "string"
    ? value.capability.replaceAll("_", "-")
    : undefined;
  const capability = rawCapability &&
      GENERATION_CAPABILITIES.includes(
        rawCapability as (typeof GENERATION_CAPABILITIES)[number],
      )
    ? rawCapability as (typeof GENERATION_CAPABILITIES)[number]
    : undefined;
  if (!capability) return null;
  const parameters = value.parameters &&
      !Array.isArray(value.parameters) &&
      typeof value.parameters === "object"
    ? value.parameters
    : undefined;
  return {
    intent,
    capability,
    effectivePrompt: typeof (value.effectivePrompt ?? value.effective_prompt ?? value.prompt) === "string"
      ? String(value.effectivePrompt ?? value.effective_prompt ?? value.prompt)
      : undefined,
    parameters,
    question,
  };
}

function jsonObjectCandidates(text: string): string[] {
  const candidates: string[] = [];
  let start = -1;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') {
      quoted = true;
      continue;
    }
    if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (character === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        candidates.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }
  return candidates;
}
