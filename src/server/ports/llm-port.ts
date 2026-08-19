export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LlmChunk {
  type: "text-delta" | "finish" | "error";
  text?: string;
  error?: string;
}

export interface LlmPort {
  chat(messages: LlmMessage[], options?: LlmOptions): Promise<string>;
  stream(messages: LlmMessage[], options?: LlmOptions): AsyncIterable<LlmChunk>;
  isConfigured(): boolean;
}
