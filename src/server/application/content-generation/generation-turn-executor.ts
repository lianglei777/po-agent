import type {
  AgentGenerationAsset,
  AgentGenerationPolicy,
} from "@/contracts/agent";
import type { GenerationAssetSlot } from "@/contracts/generation";
import { AppError } from "@/server/domain/app-error";
import type { GenerationCredentialReader } from "@/server/ports/generation-provider";
import type { GenerationRunService } from "./generation-run-service";

type GenerationPlan = NonNullable<AgentGenerationPolicy["plan"]>;

export class GenerationTurnExecutor {
  constructor(
    private readonly runs: GenerationRunService,
    private readonly credentials: GenerationCredentialReader,
  ) {}

  async execute(input: {
    sessionId: string;
    turnId: string;
    originalPrompt: string;
    reviewFirst: boolean;
    assets: AgentGenerationAsset[];
    plan: GenerationPlan;
  }) {
    const route = await this.runs.getRoute(input.plan.routeId);
    if (!route || !route.enabled) {
      throw new AppError(
        "GENERATION_ROUTE_UNAVAILABLE",
        "The planned generation API is unavailable",
        409,
      );
    }
    const expectedTool = route.capability.endsWith("-video")
      ? "generate_video"
      : "generate_image";
    if (input.plan.toolName !== expectedTool) {
      throw new AppError(
        "VALIDATION_ERROR",
        `The planned tool does not match route ${route.id}`,
        409,
      );
    }
    if (
      route.credentialRef &&
      !await this.credentials.getCredential(route.credentialRef)
    ) {
      throw new AppError(
        "GENERATION_CREDENTIAL_NOT_FOUND",
        `Credential is not configured for ${route.providerId}`,
        409,
      );
    }

    const assets = bindAndValidateAssets(input.assets, route.inputSchema.assets ?? []);
    const create = input.reviewFirst
      ? this.runs.prepareRun.bind(this.runs)
      : this.runs.createRun.bind(this.runs);
    return create({
      sessionId: input.sessionId,
      capability: route.capability,
      routeId: route.id,
      prompt: input.plan.prompt,
      originalPrompt: input.originalPrompt,
      assets,
      parameters: input.plan.parameters,
      source: "chat-workflow",
      sourceRef: input.turnId,
      idempotencyKey: `chat-turn:${input.sessionId}:${input.turnId}`,
    });
  }
}

function bindAndValidateAssets(
  assets: AgentGenerationAsset[],
  slots: GenerationAssetSlot[],
) {
  return assets.map((asset) => {
    const candidates = asset.slot.startsWith("auto-")
      ? slots.filter((slot) => slot.mediaType === asset.mediaType)
      : slots.filter((slot) => slot.key === asset.slot);
    if (candidates.length !== 1) {
      throw new AppError(
        "VALIDATION_ERROR",
        `The selected generation API cannot unambiguously bind ${asset.name}`,
        400,
      );
    }
    const slot = candidates[0]!;
    if (slot.mediaType !== asset.mediaType) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Generation asset ${asset.name} does not match slot ${slot.key}`,
        400,
      );
    }
    if (slot.acceptedTypes?.length && !slot.acceptedTypes.includes(asset.mimeType)) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Generation asset ${asset.name} has an unsupported content type`,
        400,
      );
    }
    return { slot: slot.key, ref: asset.ref };
  });
}
