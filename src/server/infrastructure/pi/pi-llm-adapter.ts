import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { Api, AssistantMessage, Context, Model } from "@earendil-works/pi-ai";
import type { LlmChunk, LlmMessage, LlmOptions, LlmPort } from "@/server/ports/llm-port";

export class PiLlmAdapter implements LlmPort {
  constructor(private readonly modelRuntime: Promise<ModelRuntime>) {}

  async chat(messages: LlmMessage[], options?: LlmOptions): Promise<string> {
    const runtime = await this.modelRuntime;
    const model = this.resolveModel(options?.model, runtime);
    const context = this.buildContext(messages);
    const result = await runtime.completeSimple(model, context, {
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
    });
    return this.extractText(result);
  }

  async *stream(messages: LlmMessage[], options?: LlmOptions): AsyncIterable<LlmChunk> {
    const runtime = await this.modelRuntime;
    const model = this.resolveModel(options?.model, runtime);
    const context = this.buildContext(messages);
    const eventStream = runtime.streamSimple(model, context, {
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
    });
    for await (const event of eventStream) {
      if (event.type === "text_delta") {
        yield { type: "text-delta", text: event.delta };
      } else if (event.type === "done") {
        yield { type: "finish" };
      } else if (event.type === "error") {
        yield { type: "error", error: event.error.errorMessage ?? "LLM stream error" };
      }
    }
  }

  isConfigured(): boolean {
    // 同步检查 — 无法 await Promise，保守返回 true，实际错误在 chat/stream 时抛出
    return true;
  }

  private resolveModel(modelId: string | undefined, runtime: ModelRuntime): Model<Api> {
    if (modelId) {
      const sep = modelId.indexOf(":");
      const provider = sep > 0 ? modelId.slice(0, sep) : modelId;
      const id = sep > 0 ? modelId.slice(sep + 1) : "";
      const model = runtime.getModel(provider, id);
      if (model) return model;
    }
    const available = runtime.getAvailableSnapshot();
    if (available.length === 0) throw new Error("No LLM model available");
    return available[0];
  }

  private buildContext(messages: LlmMessage[]): Context {
    const systemPrompt = messages.find((m) => m.role === "system")?.content;
    const chatMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content, timestamp: Date.now() }));
    return { systemPrompt, messages: chatMessages as Context["messages"] };
  }

  private extractText(message: AssistantMessage): string {
    return message.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("");
  }
}
