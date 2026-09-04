import type {
  GenerationCapability,
  GenerationRouteDto,
  GenerationInputAsset,
  GenerationRunStatus,
  GenerationToolDetails,
  JsonValue,
} from "@/contracts/generation";
import { AppError } from "@/server/domain/app-error";
import type {
  AgentToolDefinition,
  AgentToolContext,
  AgentToolProvider,
  AgentToolResult,
} from "@/server/ports/agent-tool";
import type { GenerationReviewRegistry } from "./generation-review-registry";
import type { GenerationRunService, GenerationRunView } from "./generation-run-service";
import { generationPhase, generationToolResult } from "./generation-tool-result";

const TERMINAL_STATUSES = new Set<GenerationRunStatus>([
  "succeeded",
  "failed",
  "cancelled",
]);

type GenerateInput = {
  prompt: string;
  routeId?: string;
  assets?: GenerationInputAsset[];
  parameters?: Record<string, JsonValue>;
  durationSeconds?: number;
  aspectRatio?: string;
};

export class GenerationAgentToolProvider implements AgentToolProvider {
  private readonly imageWaitTimeoutMs: number;
  private readonly videoWaitTimeoutMs: number;
  private readonly reviewWaitTimeoutMs: number;
  private readonly pollIntervalMs: number;

  constructor(
    private readonly getRunService: () => GenerationRunService,
    options: {
      waitTimeoutMs?: number;
      imageWaitTimeoutMs?: number;
      videoWaitTimeoutMs?: number;
      reviewWaitTimeoutMs?: number;
      pollIntervalMs?: number;
    } = {},
    private readonly reviews?: GenerationReviewRegistry,
  ) {
    this.imageWaitTimeoutMs = options.imageWaitTimeoutMs ?? options.waitTimeoutMs ?? 5 * 60_000;
    this.videoWaitTimeoutMs = options.videoWaitTimeoutMs ?? options.waitTimeoutMs ?? 20 * 60_000;
    this.reviewWaitTimeoutMs = options.reviewWaitTimeoutMs ?? options.waitTimeoutMs ?? 30 * 60_000;
    this.pollIntervalMs = options.pollIntervalMs ?? 2_000;
  }

  getTools(input: AgentToolContext): AgentToolDefinition[] {
    if (input.pipelineProjectId) return [];
    return [
      this.generateTool("generate_image", "Generate image", input.sessionId),
      this.generateTool("generate_video", "Generate video", input.sessionId),
      this.getGenerationTool(input.sessionId),
      this.cancelGenerationTool(input.sessionId),
    ];
  }

  private generateTool(
    name: "generate_image" | "generate_video",
    label: string,
    sessionId: string,
  ): AgentToolDefinition<GenerationToolDetails> {
    const video = name === "generate_video";
    return {
      name,
      label,
      description: video
        ? "Create a durable video generation run. The run continues if this tool call is interrupted."
        : "Create a durable image generation run. The run continues if this tool call is interrupted.",
      promptSnippet: `${name}: create durable ${video ? "video" : "image"} generation work`,
      promptGuidelines: [
        "Call this tool only when the trusted generation-turn policy says content generation is enabled and the latest user turn clearly requests this exact generation. If intent is unclear, ask a brief clarification instead. Do not mention pricing, billing, or paid APIs unless the user asks about them.",
        "The generation tool waits for completion. Do not poll get_generation automatically. Use it only when the user explicitly asks about an existing run.",
        "When referring to identifiers, distinguish the Po Agent local run ID from the provider task ID.",
        "Use workspace-relative paths or artifact IDs for generation assets.",
        "When execution pauses for parameter review, wait for the user to confirm in the existing tool step. Do not query or resubmit the run.",
      ],
      parameters: generateSchema(video),
      execute: async ({ toolCallId, input, signal, onUpdate }) => {
        const turn = this.reviews?.current(sessionId);
        if (!turn) {
          throw new AppError(
            "GENERATION_USER_AUTHORIZATION_REQUIRED",
            "Content generation is not enabled for the current user turn",
            403,
          );
        }
        const parsed = turn.plan
          ? {
              prompt: turn.plan.prompt,
              routeId: turn.plan.routeId,
              parameters: turn.plan.parameters,
              assets: undefined,
              durationSeconds: undefined,
              aspectRatio: undefined,
            }
          : parseGenerateInput(input, video);
        if (turn.plan && turn.plan.toolName !== name) {
          throw new AppError(
            "VALIDATION_ERROR",
            `The planned generation tool is ${turn.plan.toolName}`,
            409,
          );
        }
        const service = this.getRunService();
        const requestedRouteId = turn.plan?.routeId ?? (turn.mode.type === "generation-route"
          ? turn.mode.routeId
          : parsed.routeId);
        const requestedRoute = requestedRouteId
          ? await service.getRoute(requestedRouteId)
          : null;
        const capability = requestedRoute?.enabled
          ? requestedRoute.capability
          : turn.assets.length
            ? generationCapabilityFromMedia(video, turn.assets.map((asset) => asset.mediaType))
            : generationCapability(video, parsed.assets);
        if (video !== capability.endsWith("to-video")) {
          throw new AppError(
            "VALIDATION_ERROR",
            `The selected generation API does not match ${name}`,
            400,
          );
        }
        const route = await resolveGenerationRoute(service, capability, requestedRouteId);
        const assets = turn.assets.length
          ? bindTurnAssets(turn.assets, route)
          : parsed.assets;
        const parameters = turn.plan?.parameters ?? {
          ...parsed.parameters,
          ...(parsed.durationSeconds === undefined
            ? {}
            : { durationSeconds: parsed.durationSeconds }),
          ...(parsed.aspectRatio === undefined
            ? {}
            : { aspectRatio: parsed.aspectRatio }),
        };
        const create = this.reviews?.requiresReview(sessionId)
          ? service.prepareRun.bind(service)
          : service.createRun.bind(service);
        const view = await create({
          sessionId,
          capability,
          routeId: route.id,
          prompt: turn.plan?.prompt ?? parsed.prompt,
          originalPrompt: turn.originalPrompt,
          assets,
          parameters,
          source: "agent-tool",
          sourceRef: toolCallId,
          idempotencyKey: `agent-tool:${sessionId}:${toolCallId}`,
        });
        if (view.run.status === "awaiting_confirmation") {
          const route = await service.getRoute(view.run.routeId);
          return this.waitForRun(
            view,
            video ? this.videoWaitTimeoutMs : this.imageWaitTimeoutMs,
            signal,
            onUpdate,
            route ? generationRouteDetails(route) : undefined,
          );
        }
        return this.waitForRun(
          view,
          video ? this.videoWaitTimeoutMs : this.imageWaitTimeoutMs,
          signal,
          onUpdate,
        );
      },
    };
  }

  private getGenerationTool(
    sessionId: string,
  ): AgentToolDefinition<GenerationToolDetails> {
    return {
      name: "get_generation",
      label: "Get generation",
      description: "Get the durable status and artifacts for a generation run in this session.",
      parameters: runIdSchema(),
      execute: async ({ input }) => {
        const view = await this.requireSessionRun(sessionId, requiredString(input, "runId"));
        return generationToolResult(view);
      },
    };
  }

  private cancelGenerationTool(
    sessionId: string,
  ): AgentToolDefinition<GenerationToolDetails> {
    return {
      name: "cancel_generation",
      label: "Cancel generation",
      description:
        "Cancel local execution and tracking for a generation run in this session. A submitted provider task may continue and may still incur charges.",
      parameters: runIdSchema(),
      execute: async ({ input }) => {
        const runId = requiredString(input, "runId");
        await this.requireSessionRun(sessionId, runId);
        return generationToolResult(await this.getRunService().cancelRun(runId));
      },
    };
  }

  private async requireSessionRun(sessionId: string, runId: string) {
    const view = await this.getRunService().getRun(runId);
    if (!view || view.run.sessionId !== sessionId) {
      throw new AppError(
        "GENERATION_RUN_NOT_FOUND",
        "Generation run was not found in this session",
        404,
      );
    }
    return view;
  }

  private async waitForRun(
    initial: GenerationRunView,
    waitTimeoutMs: number,
    signal?: AbortSignal,
    onUpdate?: (result: AgentToolResult<GenerationToolDetails>) => void,
    reviewRoute?: GenerationRouteDto,
  ): Promise<AgentToolResult<GenerationToolDetails>> {
    let current = initial;
    let lastStatus = current.run.status;
    let lastPhase = generationPhase(current);
    let awaitingReview = current.run.status === "awaiting_confirmation";
    onUpdate?.(generationToolResult(current, { route: reviewRoute }));
    let deadline = Date.now() + (awaitingReview
      ? this.reviewWaitTimeoutMs
      : waitTimeoutMs);
    while (
      !TERMINAL_STATUSES.has(current.run.status) &&
      !signal?.aborted &&
      Date.now() < deadline
    ) {
      await delay(Math.min(this.pollIntervalMs, Math.max(0, deadline - Date.now())), signal);
      if (signal?.aborted) break;
      current = (await this.getRunService().getRun(current.run.id)) ?? current;
      if (awaitingReview && current.run.status !== "awaiting_confirmation") {
        // 用户确认后重新计算供应商执行窗口，避免审阅耗时挤占实际生成超时。
        awaitingReview = false;
        deadline = Date.now() + waitTimeoutMs;
      }
      const currentPhase = generationPhase(current);
      if (current.run.status !== lastStatus || currentPhase !== lastPhase) {
        lastStatus = current.run.status;
        lastPhase = currentPhase;
        onUpdate?.(generationToolResult(current, {
          route: current.run.status === "awaiting_confirmation"
            ? reviewRoute
            : undefined,
        }));
      }
    }
    return generationToolResult(current, {
      waitTimedOut:
        !TERMINAL_STATUSES.has(current.run.status) && !signal?.aborted,
      route: current.run.status === "awaiting_confirmation"
        ? reviewRoute
        : undefined,
    });
  }
}

function generateSchema(video: boolean) {
  return {
    type: "object" as const,
    properties: {
      prompt: { type: "string", minLength: 1, maxLength: 20_480 },
      routeId: { type: "string", minLength: 1 },
      assets: {
        type: "array",
        items: {
          type: "object",
          properties: {
            slot: { type: "string", minLength: 1 },
            artifactId: { type: "string", minLength: 1 },
            relativePath: { type: "string", minLength: 1 },
          },
          required: ["slot"],
          additionalProperties: false,
        },
      },
      parameters: { type: "object", additionalProperties: true },
      ...(video
        ? {
            durationSeconds: { type: "number", minimum: 1 },
            aspectRatio: { type: "string", minLength: 1 },
          }
        : {}),
    },
    required: ["prompt"],
    additionalProperties: false,
  };
}

function runIdSchema() {
  return {
    type: "object" as const,
    properties: { runId: { type: "string", minLength: 1 } },
    required: ["runId"],
    additionalProperties: false,
  };
}

function parseGenerateInput(
  input: Record<string, unknown>,
  video: boolean,
): GenerateInput {
  const prompt = requiredString(input, "prompt");
  const routeId = optionalString(input, "routeId");
  const parameters = isRecord(input.parameters)
    ? (input.parameters as Record<string, JsonValue>)
    : undefined;
  const assets = Array.isArray(input.assets)
    ? input.assets.map(parseAsset)
    : undefined;
  const durationSeconds = video && typeof input.durationSeconds === "number"
    ? input.durationSeconds
    : undefined;
  const aspectRatio = video ? optionalString(input, "aspectRatio") : undefined;
  return { prompt, routeId, parameters, assets, durationSeconds, aspectRatio };
}

function parseAsset(value: unknown): GenerationInputAsset {
  if (!isRecord(value)) invalidAsset();
  const slot = requiredString(value, "slot");
  const artifactId = optionalString(value, "artifactId");
  const relativePath = optionalString(value, "relativePath");
  if (Boolean(artifactId) === Boolean(relativePath)) invalidAsset();
  return {
    slot,
    ref: artifactId
      ? { type: "artifact", artifactId }
      : { type: "workspace-file", relativePath: relativePath! },
  };
}

function invalidAsset(): never {
  throw new AppError(
    "VALIDATION_ERROR",
    "Each generation asset must contain exactly one artifactId or relativePath",
    400,
  );
}

function generationCapability(
  video: boolean,
  assets?: GenerationInputAsset[],
): GenerationCapability {
  if (!assets?.length) return video ? "text-to-video" : "text-to-image";
  if (!video) return "image-to-image";
  return assets.length === 1 ? "image-to-video" : "multimodal-to-video";
}

function generationCapabilityFromMedia(
  video: boolean,
  mediaTypes: Array<"image" | "video" | "audio">,
): GenerationCapability {
  if (!mediaTypes.length) return video ? "text-to-video" : "text-to-image";
  if (!video) return "image-to-image";
  return mediaTypes.length === 1 && mediaTypes[0] === "image"
    ? "image-to-video"
    : "multimodal-to-video";
}

async function resolveGenerationRoute(
  service: GenerationRunService,
  capability: GenerationCapability,
  routeId?: string,
): Promise<GenerationRouteDto> {
  const routes = await service.listRoutes();
  const route = routeId
    ? routes.find((candidate) => candidate.id === routeId)
    : routes.find((candidate) =>
        candidate.enabled && candidate.capability === capability && candidate.isDefault
      ) ?? routes.find((candidate) => candidate.enabled && candidate.capability === capability);
  if (!route || !route.enabled || route.capability !== capability) {
    throw new AppError(
      "GENERATION_ROUTE_UNAVAILABLE",
      `No enabled generation route is available for ${capability}`,
      409,
    );
  }
  return route;
}

function bindTurnAssets(
  assets: NonNullable<ReturnType<GenerationReviewRegistry["current"]>>["assets"],
  route: GenerationRouteDto,
): GenerationInputAsset[] {
  const counts = new Map<string, number>();
  return assets.map((asset) => {
    if (!asset.slot.startsWith("auto-")) return { slot: asset.slot, ref: asset.ref };
    const candidates = (route.inputSchema.assets ?? []).filter(
      (slot) => slot.mediaType === asset.mediaType &&
        (counts.get(slot.key) ?? 0) < (slot.maxFiles ?? (slot.multiple ? Number.POSITIVE_INFINITY : 1)),
    );
    if (!candidates.length) {
      throw new AppError(
        "VALIDATION_ERROR",
        `The selected generation API cannot bind ${asset.name}`,
        400,
      );
    }
    // 首尾帧等同媒体类型槽位按 Route 声明顺序绑定，避免前端猜测供应商字段。
    const selected = candidates[0]!;
    counts.set(selected.key, (counts.get(selected.key) ?? 0) + 1);
    return { slot: selected.key, ref: asset.ref };
  });
}

function generationRouteDetails(
  route: NonNullable<Awaited<ReturnType<GenerationRunService["getRoute"]>>>,
): GenerationRouteDto {
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
    inputSchema: route.inputSchema,
  };
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = optionalString(input, key);
  if (!value) {
    throw new AppError("VALIDATION_ERROR", `${key} is required`, 400);
  }
  return value;
}

function optionalString(input: Record<string, unknown>, key: string) {
  const value = input[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (milliseconds <= 0 || signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(finish, milliseconds);
    signal?.addEventListener("abort", finish, { once: true });
    function finish() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    }
  });
}
