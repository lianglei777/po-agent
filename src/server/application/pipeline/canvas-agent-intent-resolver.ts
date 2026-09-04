import type {
  CanvasAgentGenerationPermission,
  CanvasAgentStage,
  CanvasAgentTurnIntent,
} from "@/contracts/pipeline-agent";
import type { AgentMessage } from "@/contracts/agent";
import type { LlmPort } from "@/server/ports/llm-port";
import type { SessionRepository } from "@/server/ports/session-repository";

const SYSTEM_PROMPT = `You classify the scope of the CURRENT user turn in a visual content creation canvas.
Use the recent conversation only to resolve references and confirmed constraints. The latest explicit request overrides older plans.

Choose exactly one requestedStage:
- discuss: brainstorm, explain, answer, compare, diagnose, or suggest without producing project content.
- script: write or revise a script, narration, dialogue, creative brief, or other text deliverable, then stop.
- storyboard: create or revise a shot list or storyboard specification, then stop before building executable canvas nodes.
- canvas: create or prepare nodes, prompts, references, connections, groups, or layout, then stop before any media generation API.
- generate: the user explicitly asks to generate, render, run, regenerate, or produce image/video/audio media now.
- review: inspect or compare existing results and recommend or select changes without regenerating unless the current request explicitly asks to regenerate.

Rules:
- Never infer generate merely because the project setting permits automatic generation.
- A suggestion for a possible next step is not permission to perform it.
- If the user asks for multiple steps, requestedStage is the furthest step explicitly requested now.
- Set explicitlyForbidsGeneration when the current message says not to generate, to stop before generation, or that the user will run it manually.
- Ask for clarification only when different interpretations would materially change the deliverable stage. Keep the question short.
- Return one JSON object and no markdown.

Schema:
{"requestedStage":"discuss|script|storyboard|canvas|generate|review","objective":"short description","confidence":"high|medium|low","needsClarification":false,"question":"optional string","explicitlyForbidsGeneration":false}`;

const FOLLOW_UP_SYSTEM_PROMPT = `You resolve a short user reply to the IMMEDIATELY PRECEDING assistant message in a visual content creation canvas.
Decide whether the user clearly selects one concrete stage that the assistant explicitly offered in that preceding message.

Rules:
- Use semantic meaning, not keyword matching.
- Return a stage only when the preceding assistant message offered that exact next action and the current reply clearly accepts it.
- A vague acknowledgement must return null when the preceding message offered multiple incompatible actions without mapping that acknowledgement to one action.
- Do not infer a stage from older messages, project settings, or a merely mentioned possibility.
- Return generate only when the preceding assistant explicitly offered to generate media now and the current reply accepts that offer.
- Return one JSON object and no markdown.

Schema:
{"stage":"discuss|script|storyboard|canvas|generate|review|null","confidence":"high|low"}`;

interface ClassifierDecision {
  requestedStage: CanvasAgentStage;
  objective: string;
  confidence: "high" | "medium" | "low";
  needsClarification: boolean;
  question?: string;
  explicitlyForbidsGeneration: boolean;
}

export class CanvasAgentIntentResolver {
  constructor(
    private readonly llm: LlmPort,
    private readonly sessions: SessionRepository,
  ) {}

  async resolve(input: {
    sessionId: string;
    message: string;
    model: { provider: string; modelId: string } | null;
    allowAgentGeneration: boolean;
    canvasContext: string;
  }): Promise<CanvasAgentTurnIntent> {
    const context = await this.sessions.getContext(input.sessionId);
    const payload = JSON.stringify({
      currentMessage: input.message,
      automaticGenerationEnabled: input.allowAgentGeneration,
      recentConversation: (context?.messages ?? [])
        .filter((message) => message.role === "user" || message.role === "assistant")
        .slice(-12)
        .map((message) => ({ role: message.role, text: messageText(message).slice(0, 4_000) }))
        .filter((message) => message.text.length > 0),
      canvasContext: input.canvasContext.slice(0, 16_000),
    });
    const options = {
      ...(input.model ? { model: `${input.model.provider}:${input.model.modelId}` } : {}),
      temperature: 0,
      maxTokens: 900,
    };
    const first = await this.llm.chat([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: payload },
    ], options);
    let decision = parseDecision(first);
    if (!decision) {
      const repaired = await this.llm.chat([
        { role: "system", content: `${SYSTEM_PROMPT}\nThe previous response was invalid. Return one compact JSON object only.` },
        { role: "user", content: payload },
      ], options);
      decision = parseDecision(repaired);
    }
    const resolvedDecision = await this.resolveClarifiedFollowUp(
      decision ?? fallbackDecision(input.message),
      input,
      context?.messages ?? [],
      options,
    );
    return resolvePolicy(resolvedDecision, input.message, input.allowAgentGeneration);
  }

  /**
   * 低置信澄清回合可能只收到“都行”这类承接语；必须基于上一条回复的完整语义判定，
   * 不能从自然语言表面关键词猜测下一阶段。
   */
  private async resolveClarifiedFollowUp(
    decision: ClassifierDecision,
    input: { message: string },
    context: AgentMessage[],
    options: { model?: string; temperature: number; maxTokens: number },
  ): Promise<ClassifierDecision> {
    if (!(decision.needsClarification || decision.confidence === "low")) return decision;
    const previousAssistant = [...context].reverse().find((item) => item.role === "assistant");
    if (!previousAssistant) return decision;
    const previousAssistantResponse = messageText(previousAssistant).trim();
    if (!previousAssistantResponse) return decision;

    const response = await this.llm.chat([
      { role: "system", content: FOLLOW_UP_SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify({ previousAssistantResponse, currentUserReply: input.message }) },
    ], { ...options, maxTokens: 160 });
    const followUp = parseFollowUpDecision(response);
    if (!followUp || followUp.stage === null || followUp.confidence !== "high") return decision;

    return {
      ...decision,
      requestedStage: followUp.stage,
      objective: `继续上一轮确认的${followUp.stage}工作`,
      confidence: "medium",
      needsClarification: false,
      question: undefined,
    };
  }
}

export function resolvePolicy(
  decision: ClassifierDecision,
  currentMessage: string,
  allowAgentGeneration: boolean,
): CanvasAgentTurnIntent {
  const userDeniedGeneration = decision.explicitlyForbidsGeneration;
  const requestedStage = decision.requestedStage;
  const generationPermission: CanvasAgentGenerationPermission = userDeniedGeneration
    ? "denied-by-user"
    : requestedStage !== "generate"
      ? "not-requested"
      : allowAgentGeneration
        ? "allowed"
        : "project-disabled";
  const effectiveStage = requestedStage === "generate" && generationPermission !== "allowed"
    ? "canvas"
    : requestedStage;
  const objective = decision.objective.trim() || currentMessage.trim().slice(0, 240);

  if (decision.needsClarification || decision.confidence === "low") {
    return {
      type: "clarification",
      objective,
      requestedStage,
      effectiveStage: "discuss",
      allowedStages: ["discuss"],
      generationPermission,
      confidence: "low",
      question: decision.question?.trim() || "请说明你希望本轮停在讨论、剧本、分镜、画布搭建还是内容生成。",
    };
  }
  return {
    type: "resolved",
    objective,
    requestedStage,
    effectiveStage,
    allowedStages: allowedStages(effectiveStage),
    generationPermission,
    confidence: decision.confidence,
  };
}

export function canvasAgentTurnPolicyContext(intent: CanvasAgentTurnIntent): string {
  const clarificationInstruction = intent.type === "clarification"
    ? "This is a clarification-only turn. Do not call any Canvas tool, including read-only tools. Reply with the supplied question verbatim and stop."
    : "Complete the requested deliverable instead of only describing a plan.";
  return [
    "<canvas-agent-turn-policy>",
    "This is the server-enforced scope for the current turn. Complete only the effective stage. A suggested next step is not permission to perform it. If clarification is required, ask only the supplied question and do not advance the work.",
    JSON.stringify(intent),
    `Execution contract: ${clarificationInstruction} For script or storyboard deliverables, create or update text nodes through canvas_create_plan and then canvas_apply_plan. For canvas deliverables, create the complete node/reference plan and apply it. Do not create executable media nodes during a storyboard-only turn. Asset inspection is read-only and uses canvas_inspect_assets. Save continuity only when the current user explicitly confirms it; never promote an analysis suggestion by yourself. Never call a generation tool unless effectiveStage is generate.`,
    "</canvas-agent-turn-policy>",
  ].join("\n");
}

function allowedStages(stage: CanvasAgentStage): CanvasAgentStage[] {
  switch (stage) {
    case "discuss": return ["discuss"];
    case "script": return ["discuss", "script"];
    case "storyboard": return ["discuss", "script", "storyboard"];
    case "canvas": return ["discuss", "script", "storyboard", "canvas"];
    case "generate": return ["discuss", "script", "storyboard", "canvas", "review", "generate"];
    case "review": return ["discuss", "review"];
  }
}

function parseDecision(text: string): ClassifierDecision | null {
  for (const candidate of jsonObjectCandidates(text).reverse()) {
    let value: unknown;
    try {
      value = JSON.parse(candidate);
    } catch {
      continue;
    }
    if (!isRecord(value)) continue;
    const requestedStage = value.requestedStage ?? value.requested_stage ?? value.stage;
    if (!isStage(requestedStage)) continue;
    const confidence = value.confidence;
    if (confidence !== "high" && confidence !== "medium" && confidence !== "low") continue;
    const needsClarification = value.needsClarification ?? value.needs_clarification;
    const explicitlyForbidsGeneration = value.explicitlyForbidsGeneration ?? value.explicitly_forbids_generation;
    if (typeof needsClarification !== "boolean" || typeof explicitlyForbidsGeneration !== "boolean") continue;
    return {
      requestedStage,
      objective: typeof value.objective === "string" ? value.objective : "",
      confidence,
      needsClarification,
      question: typeof value.question === "string" ? value.question : undefined,
      explicitlyForbidsGeneration,
    };
  }
  return null;
}

function parseFollowUpDecision(text: string): { stage: CanvasAgentStage | null; confidence: "high" | "low" } | null {
  for (const candidate of jsonObjectCandidates(text).reverse()) {
    let value: unknown;
    try {
      value = JSON.parse(candidate);
    } catch {
      continue;
    }
    if (!isRecord(value)) continue;
    const stage = value.stage;
    const confidence = value.confidence;
    if (stage !== null && !isStage(stage)) continue;
    if (confidence !== "high" && confidence !== "low") continue;
    return { stage, confidence };
  }
  return null;
}

function fallbackDecision(message: string): ClassifierDecision {
  return {
    requestedStage: "discuss",
    objective: message.slice(0, 240),
    confidence: "low",
    needsClarification: true,
    explicitlyForbidsGeneration: false,
  };
}

function messageText(message: AgentMessage): string {
  if (!("content" in message)) return "";
  if (typeof message.content === "string") return message.content;
  return message.content.flatMap((block) => block.type === "text" ? [block.text] : []).join("\n");
}

function isStage(value: unknown): value is CanvasAgentStage {
  return value === "discuss" || value === "script" || value === "storyboard" ||
    value === "canvas" || value === "generate" || value === "review";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
    if (character === '"') quoted = true;
    else if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (character === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) candidates.push(text.slice(start, index + 1));
    }
  }
  return candidates;
}
