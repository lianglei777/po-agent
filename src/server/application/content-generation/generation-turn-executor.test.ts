import { describe, expect, it, vi } from "vitest";
import type { GenerationRunService } from "./generation-run-service";
import { GenerationTurnExecutor } from "./generation-turn-executor";

const route = {
  id: "image-route",
  name: "Image",
  capability: "image-to-image" as const,
  product: "Image",
  providerId: "provider",
  providerOperation: "create",
  enabled: true,
  isDefault: true,
  revision: 1,
  defaults: {},
  inputSchema: {
    prompt: { required: true },
    assets: [{
      key: "imageUrls",
      label: "Reference",
      mediaType: "image" as const,
      required: true,
      multiple: true,
      acceptedTypes: ["image/png"],
    }],
  },
  adapterConfig: {},
  credentialRef: "provider-key",
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
};

function setup(credential: string | null = "secret") {
  const createRun = vi.fn(async (input: unknown) => ({
    created: true,
    run: { id: "run-1", ...(input as object) },
    jobs: [],
    artifacts: [],
  }));
  const prepareRun = vi.fn(createRun);
  const runs = {
    getRoute: vi.fn(async () => route),
    createRun,
    prepareRun,
  } as unknown as GenerationRunService;
  const executor = new GenerationTurnExecutor(runs, {
    getCredential: vi.fn(async () => credential),
  });
  return { createRun, executor, prepareRun };
}

const input = {
  sessionId: "session-1",
  turnId: "turn-123",
  originalPrompt: "把男性改成女性",
  reviewFirst: false,
  assets: [{
    slot: "auto-image",
    name: "reference.png",
    mediaType: "image" as const,
    mimeType: "image/png",
    ref: {
      type: "workspace-file" as const,
      relativePath: ".po-agent/generation-inputs/reference.png",
    },
  }],
  plan: {
    toolName: "generate_image" as const,
    routeId: "image-route",
    prompt: "将参考图中的男性人物改为女性",
    parameters: {},
  },
};

describe("GenerationTurnExecutor", () => {
  it("binds trusted Composer assets and uses the turn id for idempotency", async () => {
    const { createRun, executor } = setup();

    await executor.execute(input);

    expect(createRun).toHaveBeenCalledWith(expect.objectContaining({
      source: "chat-workflow",
      sourceRef: "turn-123",
      idempotencyKey: "chat-turn:session-1:turn-123",
      assets: [{
        slot: "imageUrls",
        ref: input.assets[0].ref,
      }],
    }));
  });

  it("creates an awaiting-confirmation run without submitting a provider job", async () => {
    const { executor, prepareRun } = setup();

    await executor.execute({ ...input, reviewFirst: true });

    expect(prepareRun).toHaveBeenCalledOnce();
  });

  it("fails before creating a paid run when the credential is missing", async () => {
    const { createRun, executor } = setup(null);

    await expect(executor.execute(input)).rejects.toMatchObject({
      code: "GENERATION_CREDENTIAL_NOT_FOUND",
    });
    expect(createRun).not.toHaveBeenCalled();
  });

  it("rejects attachment types that the selected route does not accept", async () => {
    const { createRun, executor } = setup();

    await expect(executor.execute({
      ...input,
      assets: [{ ...input.assets[0], mimeType: "image/jpeg" }],
    })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(createRun).not.toHaveBeenCalled();
  });
});
