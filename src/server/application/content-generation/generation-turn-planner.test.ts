import { describe, expect, it, vi } from "vitest";
import type {
  GenerationRouteDto,
  PlanGenerationTurnRequest,
} from "@/contracts/generation";
import type { GenerationIntentClassifier } from "@/server/ports/generation-intent-classifier";
import { planGenerationTurn } from "./generation-turn-planner";

const route = (
  id: string,
  capability: GenerationRouteDto["capability"],
  isDefault = true,
): GenerationRouteDto => ({
  id,
  name: id,
  capability,
  product: "Product",
  providerId: "provider",
  enabled: true,
  isDefault,
  revision: 1,
  defaults: {},
  inputSchema: {
    prompt: { required: true },
    parameters: [{ key: "durationSeconds", label: "Duration", type: "number" }],
  },
});

const routes = [
  route("text-image", "text-to-image"),
  route("image-image", "image-to-image"),
  route("text-video", "text-to-video"),
  route("image-video", "image-to-video"),
];
const baseRequest = {
  model: { provider: "provider", modelId: "chat-model" },
  mode: { type: "generation-auto" },
  assets: [],
} satisfies Omit<PlanGenerationTurnRequest, "message">;
const context = { conversation: [], recentRuns: [] };

function classifier(
  decision: Awaited<ReturnType<GenerationIntentClassifier["classify"]>>,
): GenerationIntentClassifier {
  return { classify: vi.fn().mockResolvedValue(decision) };
}

describe("planGenerationTurn", () => {
  it("keeps an analytical follow-up in chat when the AI classifies it as chat", async () => {
    const input = {
      ...baseRequest,
      message: "为什么这张图和我上传的一模一样？分析原因",
    };
    await expect(
      planGenerationTurn(input, routes, classifier({ intent: "chat" }), context),
    ).resolves.toEqual({ type: "chat" });
  });

  it("selects an image-to-video route and preserves the contextual effective prompt", async () => {
    const input: PlanGenerationTurnRequest = {
      ...baseRequest,
      message: "让它动起来，8 秒",
      assets: [{ mediaType: "image", mimeType: "image/png" }],
    };
    await expect(planGenerationTurn(
      input,
      routes,
      classifier({
        intent: "generation",
        capability: "image-to-video",
        effectivePrompt: "让所附人物海报中的角色自然眨眼并产生轻微衣摆运动，时长 8 秒",
        parameters: { durationSeconds: 8, ignored: true },
      }),
      context,
    )).resolves.toMatchObject({
      type: "generation",
      route: { id: "image-video" },
      effectivePrompt: "让所附人物海报中的角色自然眨眼并产生轻微衣摆运动，时长 8 秒",
      parameters: { durationSeconds: 8 },
    });
  });

  it("does not silently replace a user-selected incompatible API", async () => {
    const input: PlanGenerationTurnRequest = {
      ...baseRequest,
      message: "生成一个视频",
      mode: { type: "generation-route", routeId: "text-image" },
    };
    await expect(planGenerationTurn(
      input,
      routes,
      classifier({ intent: "generation", capability: "text-to-video" }),
      context,
    )).resolves.toMatchObject({
      type: "clarification",
      reason: "GENERATION_ROUTE_MISMATCH",
      suggestedRoute: { id: "text-video" },
    });
  });
});
