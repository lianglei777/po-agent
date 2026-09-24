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
- canvas: create or prepare nodes, prompts, references, connections, groups, or layout. Requests to generate, render, run, regenerate, or produce media also map to canvas: prepare everything and stop so the user can trigger generation from the canvas.
- review: inspect or compare existing results and recommend or select changes without regenerating unless the current request explicitly asks to regenerate.

Rules:
- This Agent never triggers a media generation API. A request to generate means preparing the requested nodes for manual generation.
- A suggestion for a possible next step is not permission to perform it.
- If the user asks for multiple steps, requestedStage is the furthest step explicitly requested now.
- The storage representation does not decide the stage. Saving a script or storyboard as one or more text nodes is still script or storyboard. Use canvas only when the user asks for executable media nodes, generation prompts, Routes, media references, connections, groups, or production layout.
- Ask for clarification only when different interpretations would materially change the deliverable stage. Keep the question short.
- Set scope.projectWide only when the user requests a whole-project or whole-canvas change. Otherwise return the stable node IDs explicitly selected, mentioned, or semantically targeted in scope.nodeIds. New nodes do not need IDs in scope.
- Return one JSON object and no markdown.

Schema:
{"requestedStage":"discuss|script|storyboard|canvas|review","objective":"short description","scope":{"projectWide":false,"nodeIds":[]},"confidence":"high|medium|low","needsClarification":false,"question":"optional string"}`;

const FOLLOW_UP_SYSTEM_PROMPT = `You resolve a short user reply to the IMMEDIATELY PRECEDING assistant message in a visual content creation canvas.
Decide whether the user clearly selects one concrete stage that the assistant explicitly offered in that preceding message.

Rules:
- Use semantic meaning, not keyword matching.
- Return a stage only when the preceding assistant message offered that exact next action and the current reply clearly accepts it.
- A vague acknowledgement must return null when the preceding message offered multiple incompatible actions without mapping that acknowledgement to one action.
- Do not infer a stage from older messages, project settings, or a merely mentioned possibility.
- If the preceding assistant offered to generate media and the user accepts, return canvas so the Agent prepares the nodes for manual generation.
- Return one JSON object and no markdown.

Schema:
{"stage":"discuss|script|storyboard|canvas|review|null","confidence":"high|low"}`;

interface ClassifierDecision {
  requestedStage: CanvasAgentStage;
  objective: string;
  confidence: "high" | "medium" | "low";
  needsClarification: boolean;
  question?: string;
  explicitlyForbidsGeneration: boolean;
  scope: { projectWide: boolean; nodeIds: string[] };
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
    availableNodeIds?: string[];
    focusNodeIds?: string[];
  }): Promise<CanvasAgentTurnIntent> {
    const context = await this.sessions.getContext(input.sessionId);
    const payload = JSON.stringify({
      currentMessage: input.message,
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
    return resolvePolicy(
      normalizeDecisionScope(resolvedDecision, input.availableNodeIds, input.focusNodeIds),
      input.message,
      input.allowAgentGeneration,
    );
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
  // 兼容旧调用签名；该开关不再扩大或收紧 Canvas Agent 的回合权限。
  void allowAgentGeneration;
  // 兼容旧模型偶尔返回 generate；Canvas Agent 当前只准备画布，永远不获得付费生成权限。
  const classifiedStage = decision.requestedStage === "generate" ? "canvas" : decision.requestedStage;
  // 模型偶尔会被“修复/核对”等措辞带到 review；显式要求调用 Prompt 或预检时，实际边界至少是 canvas。
  const explicitStage = explicitExecutionStage(currentMessage);
  const requestedStage = higherStage(classifiedStage, explicitStage);
  const generationPermission: CanvasAgentGenerationPermission = "not-requested";
  const effectiveStage = requestedStage;
  const objective = decision.objective.trim() || currentMessage.trim().slice(0, 240);

  if (!explicitStage && (decision.needsClarification || decision.confidence === "low")) {
    return {
      type: "clarification",
      objective,
      requestedStage,
      effectiveStage: "discuss",
      allowedStages: ["discuss"],
      generationPermission,
      scope: decision.scope,
      confidence: "low",
      question: decision.question?.trim() || "请说明你希望本轮停在讨论、剧本、分镜还是画布准备。",
    };
  }
  return {
    type: "resolved",
    objective,
    requestedStage,
    effectiveStage,
    allowedStages: allowedStages(effectiveStage),
    generationPermission,
    scope: decision.scope,
    // 显式执行语义可以纠正分类器的低置信结果，但不能把低置信状态带入 resolved 合同。
    confidence: decision.confidence === "low" ? "medium" : decision.confidence,
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
    `Execution contract: ${clarificationInstruction} Use pipeline_run_script_specialist for script writing or revision, pipeline_run_asset_specialist for stable character/scene/prop specifications, pipeline_run_storyboard_specialist for shot specifications, and pipeline_run_prompt_specialist for Route-ready media nodes. A complete workflow is strictly sequential: Script -> apply -> Asset -> apply -> Storyboard -> apply -> Prompt -> apply -> canvas_prepare_generation. Never call a downstream Specialist before its required upstream plan is applied, never use a placeholder objective, and pass the real node IDs returned by apply. Every sourceNodeId and targetNodeId passed to a Specialist must be listed in scope.nodeIds unless scope.projectWide is true; the wider node index is read-only context. Call only the Specialists needed for the current objective and reuse reliable existing nodes. For a multi-episode drama, apply the Script plan first, run Asset once across the applied episode nodes, then run Storyboard and Prompt separately for each episodeKey; apply each bounded plan before continuing so no episode is silently truncated. Each Specialist already performs one internal format repair: call it at most once for the same unchanged canvas version and bounded episode or scene range. If a non-error Specialist result reports a correctable upstream content gap, revise and apply the upstream plan first; the changed canvas version may then be evaluated again. Never replace a failed Specialist with direct canvas_create_plan output, never retry a failed plan application, and do not call canvas_undo_action in the same turn. A PIPELINE_SPECIALIST_BATCH_REQUIRED result means continue with a smaller unprocessed episode or scene range, not retry the same range. Report the exact blocking error and preserve completed canvas work. For a complete canvas deliverable, finish with canvas_prepare_generation as a configuration check. Do not call canvas_inspect_assets or canvas_review_results while only preparing Route-ready nodes; those tools inspect completed local media. Do not create executable media nodes during a storyboard-only turn. Use canvas_create_plan directly only for small manual canvas edits that do not create or imitate creativeSpec. Asset inspection is read-only and uses canvas_inspect_assets. Save continuity only when the current user explicitly confirms it; never promote an analysis suggestion by yourself. This Agent cannot trigger generation; after preparation, tell the user which node or workflow they can run manually.`,
    "</canvas-agent-turn-policy>",
  ].join("\n");
}

function allowedStages(stage: CanvasAgentStage): CanvasAgentStage[] {
  switch (stage) {
    case "discuss": return ["discuss"];
    case "script": return ["discuss", "script"];
    case "storyboard": return ["discuss", "script", "storyboard"];
    case "canvas": return ["discuss", "script", "storyboard", "canvas", "review"];
    case "generate": return ["discuss", "script", "storyboard", "canvas"];
    case "review": return ["discuss", "review"];
  }
}

function explicitExecutionStage(message: string): CanvasAgentStage | null {
  if (/(?:调用|执行|运行|应用|创建|生成|重跑|完成).{0,80}(?:prompt\s*specialist|canvas_prepare_generation|预检)/i.test(message)) {
    return "canvas";
  }
  if (/(?:调用|执行|运行|应用|创建|生成|重跑|完成).{0,80}(?:storyboard\s*specialist|分镜)/i.test(message)) {
    return "storyboard";
  }
  if (/(?:asset\s*specialist|资产规格|角色资产|场景资产|道具资产|统一.{0,20}(?:角色|造型|资产)|更新.{0,20}(?:角色|造型|资产)|别名.{0,20}(?:合并|统一)|continuity\s*bible)/i.test(message)) {
    return "canvas";
  }
  if (/(?:调用|执行|运行|应用|创建|生成|重跑|完成).{0,80}(?:script\s*specialist|剧本)/i.test(message)) {
    return "script";
  }
  return null;
}

function higherStage(left: CanvasAgentStage, right: CanvasAgentStage | null): CanvasAgentStage {
  if (!right) return left;
  const rank: Record<CanvasAgentStage, number> = {
    discuss: 0, script: 1, storyboard: 2, canvas: 3, generate: 3, review: 0,
  };
  return rank[right] > rank[left] ? right : left;
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
    const explicitlyForbidsGeneration = value.explicitlyForbidsGeneration ?? value.explicitly_forbids_generation ?? false;
    const scope = parseScope(value.scope);
    if (typeof needsClarification !== "boolean" || typeof explicitlyForbidsGeneration !== "boolean" || !scope) continue;
    return {
      requestedStage,
      objective: typeof value.objective === "string" ? value.objective : "",
      confidence,
      needsClarification,
      question: typeof value.question === "string" ? value.question : undefined,
      explicitlyForbidsGeneration,
      scope,
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
    scope: { projectWide: false, nodeIds: [] },
  };
}

function parseScope(value: unknown): ClassifierDecision["scope"] | null {
  if (!isRecord(value) || typeof value.projectWide !== "boolean" || !Array.isArray(value.nodeIds)) return null;
  if (value.nodeIds.some((nodeId) => typeof nodeId !== "string" || !nodeId.trim() || nodeId.length > 128)) return null;
  return { projectWide: value.projectWide, nodeIds: [...new Set(value.nodeIds.map((nodeId) => nodeId.trim()))] };
}

function normalizeDecisionScope(
  decision: ClassifierDecision,
  availableNodeIds: string[] | undefined,
  focusNodeIds: string[] | undefined,
): ClassifierDecision {
  if (!availableNodeIds) return decision;
  if (decision.scope.projectWide) return { ...decision, scope: { projectWide: true, nodeIds: [] } };
  const available = new Set(availableNodeIds);
  // 模型负责语义选取，application 只允许当前项目中的真实节点，并保留用户显式选择或 @ 引用的节点。
  const nodeIds = [...new Set([...(focusNodeIds ?? []), ...decision.scope.nodeIds])]
    .filter((nodeId) => available.has(nodeId));
  return { ...decision, scope: { projectWide: false, nodeIds } };
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
