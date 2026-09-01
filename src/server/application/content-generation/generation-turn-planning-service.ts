import type {
  GenerationRouteDto,
  PlanGenerationTurnRequest,
} from "@/contracts/generation";
import type { GenerationRoute } from "@/server/domain/generation";
import type { GenerationCredentialReader } from "@/server/ports/generation-provider";
import type { GenerationIntentClassifier } from "@/server/ports/generation-intent-classifier";
import type { SessionRepository } from "@/server/ports/session-repository";
import { planGenerationTurn } from "./generation-turn-planner";
import type { GenerationRunService } from "./generation-run-service";

export class GenerationTurnPlanningService {
  constructor(
    private readonly runs: GenerationRunService,
    private readonly sessions: SessionRepository,
    private readonly classifier: GenerationIntentClassifier,
    private readonly credentials: GenerationCredentialReader,
  ) {}

  async plan(input: PlanGenerationTurnRequest) {
    const allRoutes = await this.runs.listRoutes();
    const providerIds = [...new Set(allRoutes.map((route) => route.providerId))];
    const providerEnabled = new Map(
      await Promise.all(providerIds.map(async (providerId) => [
        providerId,
        (await this.runs.getProviderSettings(providerId)).enabled,
      ] as const)),
    );
    const credentialAvailable = new Map(
      await Promise.all(allRoutes.map(async (route) => [
        route.id,
        !route.credentialRef || Boolean(
          await this.credentials.getCredential(route.credentialRef),
        ),
      ] as const)),
    );
    const routes = allRoutes
      .filter((route) =>
        route.enabled &&
        // 这两类 Route 依赖画布专用的媒体或人脸准备态，不能交给 Chat 规划器直接调用。
        route.capability !== "video-to-audio" &&
        route.capability !== "audio-to-video" &&
        providerEnabled.get(route.providerId) === true &&
        credentialAvailable.get(route.id) === true
      )
      .map(generationRouteDto);
    const sessionContext = input.sessionId
      ? await this.sessions.getContext(input.sessionId)
      : null;
    const recentRuns = input.sessionId
      ? await this.runs.listRunsForContext(input.sessionId)
      : [];

    return planGenerationTurn(input, routes, this.classifier, {
      // Planner 只需要有限文本和稳定 Run 摘要，不能携带工具结果或二进制图片。
      conversation: (sessionContext?.messages ?? [])
        .filter((message) => message.role === "user" || message.role === "assistant")
        .slice(-12)
        .map((message) => ({
          role: message.role as "user" | "assistant",
          text: messageText(message.content).slice(0, 4_000),
        }))
        .filter((message) => message.text.length > 0),
      recentRuns: recentRuns.slice(0, 5).map(({ run }) => ({
        routeId: run.routeId,
        capability: run.capability,
        prompt: run.prompt.slice(0, 4_000),
        status: run.status,
      })),
    });
  }
}

export function generationRouteDto(route: GenerationRoute): GenerationRouteDto {
  return {
    id: route.id,
    name: route.name,
    description: route.description,
    tags: route.tags,
    capability: route.capability,
    product: route.product,
    providerId: route.providerId,
    enabled: route.enabled,
    isDefault: route.isDefault,
    revision: route.revision,
    defaults: route.defaults,
    inputSchema: {
      ...route.inputSchema,
      parameters: route.inputSchema.parameters?.filter((field) => !field.internal),
    },
  };
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .flatMap((block) =>
      block && typeof block === "object" && "text" in block &&
        typeof block.text === "string"
        ? [block.text]
        : [],
    )
    .join("\n");
}
