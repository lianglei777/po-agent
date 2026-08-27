import type {
  GenerationCapability,
  GenerationRouteDto,
  JsonValue,
} from "@/contracts/generation";

export interface GenerationIntentContextMessage {
  role: "user" | "assistant";
  text: string;
}

export interface GenerationIntentRunSummary {
  routeId: string;
  capability: GenerationCapability;
  prompt: string;
  status: string;
}

export interface GenerationIntentDecision {
  intent: "chat" | "attachment-understanding" | "generation" | "clarification";
  capability?: GenerationCapability;
  routeId?: string;
  effectivePrompt?: string;
  parameters?: Record<string, JsonValue>;
  question?: string;
}

export interface GenerationIntentClassifier {
  classify(input: {
    model: { provider: string; modelId: string };
    message: string;
    assets: Array<{ mediaType: "image" | "video" | "audio"; mimeType: string }>;
    routes: GenerationRouteDto[];
    conversation: GenerationIntentContextMessage[];
    recentRuns: GenerationIntentRunSummary[];
  }): Promise<GenerationIntentDecision>;
}
