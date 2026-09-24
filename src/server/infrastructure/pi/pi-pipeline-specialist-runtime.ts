import type { Api, AssistantMessage, Context, Model } from "@earendil-works/pi-ai";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { PipelineSpecialistRuntime } from "@/server/ports/pipeline-specialist-runtime";

export class PiPipelineSpecialistRuntime implements PipelineSpecialistRuntime {
  constructor(
    private readonly modelRuntime: Promise<ModelRuntime>,
    private readonly requestTimeoutMs = 180_000,
  ) {}

  async run(input: Parameters<PipelineSpecialistRuntime["run"]>[0]): Promise<string> {
    if (input.signal?.aborted) throw input.signal.reason ?? new Error("Specialist execution was cancelled");
    const runtime = await this.modelRuntime;
    const model = resolveModel(input.model, runtime);
    const repairInstruction = input.repairResponse
      ? `\nThe previous response was invalid. Repair it and return one JSON object only. Previous response:\n${input.repairResponse.slice(0, 12_000)}`
      : "";
    const context: Context = {
      systemPrompt: [
        input.profile.systemPrompt,
        "<specialist-skill>",
        input.profile.skillInstructions,
        "</specialist-skill>",
        "Return exactly one JSON object. Do not use markdown fences or explanatory text.",
        `<output-contract>${input.outputContract}</output-contract>`,
        repairInstruction,
      ].join("\n"),
      messages: [{ role: "user", content: input.context, timestamp: Date.now() }] as Context["messages"],
    };
    // 外部模型网关偶尔不会主动结束请求；适配器必须有独立上限，避免锁死整个 Agent 回合。
    const signal = input.signal
      ? AbortSignal.any([input.signal, AbortSignal.timeout(this.requestTimeoutMs)])
      : AbortSignal.timeout(this.requestTimeoutMs);
    const options = {
      temperature: input.repairResponse ? 0 : input.profile.temperature,
      maxTokens: input.profile.maxOutputTokens,
      reasoning: "low",
      samplingParams: { response_format: { type: "json_object" } },
      signal,
    } as const;
    let result = await runtime.completeSimple(model, context, options);
    if (result.stopReason === "error" && rejectsJsonResponseFormat(result.errorMessage)) {
      // 部分 OpenAI 兼容网关声明支持 response_format，却会在较长 JSON 输出时直接返回 400。
      // 这里只移除供应商提示，输出仍必须通过 application 层 Schema 校验，失败后仍仅允许一次格式修复。
      result = await runtime.completeSimple(model, context, {
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        reasoning: options.reasoning,
        signal: options.signal,
      });
    }
    if (result.stopReason === "aborted") {
      if (!input.signal?.aborted && signal.aborted) {
        throw new Error(`Pipeline Specialist model request timed out after ${this.requestTimeoutMs}ms`);
      }
      throw new Error("Pipeline Specialist execution was cancelled");
    }
    if (result.stopReason === "error") {
      throw new Error(result.errorMessage || "Pipeline Specialist model request failed");
    }
    return extractText(result);
  }
}

function rejectsJsonResponseFormat(message: string | undefined): boolean {
  if (!message) return false;
  return /response_format|json response|invalidparameter.*json/i.test(message);
}

function resolveModel(modelId: string | undefined, runtime: ModelRuntime): Model<Api> {
  if (modelId) {
    const separator = modelId.indexOf(":");
    const provider = separator > 0 ? modelId.slice(0, separator) : modelId;
    const id = separator > 0 ? modelId.slice(separator + 1) : "";
    const model = runtime.getModel(provider, id);
    if (model) return model;
  }
  const available = runtime.getAvailableSnapshot();
  if (!available.length) throw new Error("No LLM model available for Pipeline Specialist");
  return available[0]!;
}

function extractText(message: AssistantMessage): string {
  return message.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("");
}
