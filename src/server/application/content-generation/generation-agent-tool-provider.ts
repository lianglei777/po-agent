import type {
  GenerationArtifactDto,
  GenerationCapability,
  GenerationInputAsset,
  GenerationRunStatus,
  GenerationToolDetails,
  JsonValue,
} from "@/contracts/generation";
import { AppError } from "@/server/domain/app-error";
import type {
  AgentToolDefinition,
  AgentToolProvider,
  AgentToolResult,
} from "@/server/ports/agent-tool";
import type {
  GenerationRunService,
  GenerationRunView,
} from "./generation-run-service";

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
  private readonly waitTimeoutMs: number;
  private readonly pollIntervalMs: number;

  constructor(
    private readonly getRunService: () => GenerationRunService,
    options: { waitTimeoutMs?: number; pollIntervalMs?: number } = {},
  ) {
    this.waitTimeoutMs = options.waitTimeoutMs ?? 30_000;
    this.pollIntervalMs = options.pollIntervalMs ?? 1_000;
  }

  getTools(input: { sessionId: string; cwd: string }): AgentToolDefinition[] {
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
        "Do not repeat a generate call after a timeout; use get_generation with the returned runId.",
        "Use workspace-relative paths or artifact IDs for generation assets.",
      ],
      parameters: generateSchema(video),
      execute: async ({ toolCallId, input, signal, onUpdate }) => {
        const parsed = parseGenerateInput(input, video);
        const capability = generationCapability(video, parsed.assets);
        const parameters = {
          ...parsed.parameters,
          ...(parsed.durationSeconds === undefined
            ? {}
            : { durationSeconds: parsed.durationSeconds }),
          ...(parsed.aspectRatio === undefined
            ? {}
            : { aspectRatio: parsed.aspectRatio }),
        };
        const view = await this.getRunService().createRun({
          sessionId,
          capability,
          routeId: parsed.routeId,
          prompt: parsed.prompt,
          assets: parsed.assets,
          parameters,
          source: "agent-tool",
          sourceRef: toolCallId,
          idempotencyKey: `agent-tool:${sessionId}:${toolCallId}`,
        });
        return this.waitForRun(view, signal, onUpdate);
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
    signal?: AbortSignal,
    onUpdate?: (result: AgentToolResult<GenerationToolDetails>) => void,
  ): Promise<AgentToolResult<GenerationToolDetails>> {
    let current = initial;
    let lastStatus = current.run.status;
    onUpdate?.(generationToolResult(current));
    const deadline = Date.now() + this.waitTimeoutMs;
    while (
      !TERMINAL_STATUSES.has(current.run.status) &&
      !signal?.aborted &&
      Date.now() < deadline
    ) {
      await delay(Math.min(this.pollIntervalMs, Math.max(0, deadline - Date.now())), signal);
      if (signal?.aborted) break;
      current = (await this.getRunService().getRun(current.run.id)) ?? current;
      if (current.run.status !== lastStatus) {
        lastStatus = current.run.status;
        onUpdate?.(generationToolResult(current));
      }
    }
    return generationToolResult(current);
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

function generationToolResult(
  view: GenerationRunView,
): AgentToolResult<GenerationToolDetails> {
  const details: GenerationToolDetails = {
    runId: view.run.id,
    status: view.run.status,
    artifacts: view.artifacts.map((artifact): GenerationArtifactDto => ({
      ...artifact,
    })),
    ...(view.run.errorCode || view.run.errorMessage
      ? {
          error: {
            code: view.run.errorCode ?? "GENERATION_FAILED",
            message: view.run.errorMessage ?? "Generation failed",
          },
        }
      : {}),
  };
  const suffix = details.artifacts.length
    ? ` with ${details.artifacts.length} artifact(s)`
    : "";
  return {
    content: [{
      type: "text",
      text: `Generation ${details.runId} is ${details.status}${suffix}.`,
    }],
    details,
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
