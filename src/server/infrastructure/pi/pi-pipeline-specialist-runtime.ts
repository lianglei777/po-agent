import type { Api, AssistantMessage, Context, Model } from "@earendil-works/pi-ai";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { AppError } from "@/server/domain/app-error";
import type { PipelineSpecialistRuntime } from "@/server/ports/pipeline-specialist-runtime";

export class PiPipelineSpecialistRuntime implements PipelineSpecialistRuntime {
  constructor(
    private readonly modelRuntime: Promise<ModelRuntime>,
    private readonly requestTimeoutMs = 180_000,
  ) {}

  async run(input: Parameters<PipelineSpecialistRuntime["run"]>[0]): Promise<string> {
    if (input.signal?.aborted) throw cancelled(input.profile.kind);
    let runtime: ModelRuntime;
    try {
      runtime = await this.modelRuntime;
    } catch {
      throw new AppError("PIPELINE_SPECIALIST_MODEL_UNAVAILABLE", `The ${input.profile.kind} Specialist model runtime is unavailable`, 503, {
        specialist: input.profile.kind,
      });
    }
    const model = resolveModel(input.model, runtime, input.profile.kind);
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
    const requestTimeoutMs = Math.min(input.profile.requestTimeoutMs, this.requestTimeoutMs);
    const timeoutSignal = AbortSignal.timeout(requestTimeoutMs);
    const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;
    const options = {
      temperature: input.repairResponse ? 0 : input.profile.temperature,
      maxTokens: input.profile.maxOutputTokens,
      reasoning: "low",
      samplingParams: { response_format: { type: "json_object" } },
      signal,
    } as const;
    let result: AssistantMessage;
    try {
      result = await runtime.completeSimple(model, context, options);
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
    } catch {
      throw classifyFailure(input, timeoutSignal, requestTimeoutMs);
    }
    if (result.stopReason === "aborted") {
      throw classifyFailure(input, timeoutSignal, requestTimeoutMs);
    }
    if (result.stopReason === "error") {
      throw runtimeFailed(input.profile.kind, model);
    }
    return extractText(result);
  }
}

function rejectsJsonResponseFormat(message: string | undefined): boolean {
  if (!message) return false;
  return /response_format|json response|invalidparameter.*json/i.test(message);
}

function resolveModel(modelId: string | undefined, runtime: ModelRuntime, specialist: string): Model<Api> {
  if (modelId) {
    const separator = modelId.indexOf(":");
    const provider = separator > 0 ? modelId.slice(0, separator) : modelId;
    const id = separator > 0 ? modelId.slice(separator + 1) : "";
    const model = runtime.getModel(provider, id);
    if (model) return model;
  }
  const available = runtime.getAvailableSnapshot();
  if (!available.length) {
    throw new AppError("PIPELINE_SPECIALIST_MODEL_UNAVAILABLE", `No enabled model is available for the ${specialist} Specialist`, 409, {
      specialist,
      nextAction: "Configure and enable a model, then retry this stage",
    });
  }
  return available[0]!;
}

function classifyFailure(
  input: Parameters<PipelineSpecialistRuntime["run"]>[0],
  timeoutSignal: AbortSignal,
  requestTimeoutMs: number,
): AppError {
  if (input.signal?.aborted) return cancelled(input.profile.kind);
  if (timeoutSignal.aborted) {
    return new AppError("PIPELINE_SPECIALIST_TIMEOUT", `The ${input.profile.kind} Specialist timed out`, 504, {
      specialist: input.profile.kind,
      timeoutMs: requestTimeoutMs,
      nextAction: "Preserve completed canvas work and retry this stage in a new turn",
    });
  }
  return runtimeFailed(input.profile.kind);
}

function cancelled(kind: string): AppError {
  return new AppError("PIPELINE_SPECIALIST_CANCELLED", `The ${kind} Specialist was cancelled`, 409, {
    specialist: kind,
    nextAction: "Preserve completed canvas work",
  });
}

function runtimeFailed(kind: string, model?: Model<Api>): AppError {
  return new AppError("PIPELINE_SPECIALIST_RUNTIME_FAILED", `The ${kind} Specialist model request failed`, 502, {
    specialist: kind,
    ...(model ? { provider: model.provider, model: model.id } : {}),
    nextAction: "Check the selected model and provider, then retry this stage in a new turn",
  });
}

function extractText(message: AssistantMessage): string {
  return message.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("");
}
