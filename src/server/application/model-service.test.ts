import { describe, expect, it, vi } from "vitest";
import type { ModelProvider } from "@/server/ports/model-provider";
import type { AgentRuntimeRegistry } from "@/server/ports/agent-runtime";
import { ModelService } from "./model-service";

describe("ModelService", () => {
  it("invalidates only runtimes affected by the saved model change", async () => {
    const previous = {
      providers: {
        custom: {
          models: [
            {
              id: "model-a",
              compat: { supportsDeveloperRole: true },
            },
          ],
        },
      },
    };
    const config = {
      providers: {
        custom: {
          models: [
            {
              id: "model-a",
              compat: { supportsDeveloperRole: false },
            },
          ],
        },
      },
    };
    const models = modelProviderStub({
      readConfig: vi.fn(async () => previous),
    });
    const invalidateModelConfig = vi.fn();
    const runtimes = runtimeRegistryStub(invalidateModelConfig);
    const service = new ModelService(models, runtimes);

    await service.writeConfig(config);

    expect(models.writeConfig).toHaveBeenCalledWith(config);
    expect(invalidateModelConfig).toHaveBeenCalledWith({
      scope: "targets",
      targets: [{ provider: "custom", modelId: "model-a" }],
    });
  });

  it("does not invalidate runtimes for runtime-neutral changes", async () => {
    const models = modelProviderStub({
      readConfig: vi.fn(async () => ({
        metadata: "old",
        providers: { custom: { name: "Old" } },
      })),
    });
    const invalidateModelConfig = vi.fn();
    const service = new ModelService(
      models,
      runtimeRegistryStub(invalidateModelConfig),
    );

    await service.writeConfig({
      metadata: "new",
      providers: { custom: { name: "New" } },
    });

    expect(invalidateModelConfig).not.toHaveBeenCalled();
  });

  it("invalidates all runtimes when the previous config cannot be read", async () => {
    const models = modelProviderStub({
      readConfig: vi.fn(async () => {
        throw new Error("read failed");
      }),
    });
    const invalidateModelConfig = vi.fn();
    const service = new ModelService(
      models,
      runtimeRegistryStub(invalidateModelConfig),
    );

    await service.writeConfig({ providers: {} });

    expect(invalidateModelConfig).toHaveBeenCalledWith({ scope: "all" });
  });

  it("does not invalidate runtimes when writing model config fails", async () => {
    const failure = new Error("write failed");
    const models = modelProviderStub({
      writeConfig: vi.fn(async () => {
        throw failure;
      }),
    });
    const invalidateModelConfig = vi.fn();
    const runtimes = runtimeRegistryStub(invalidateModelConfig);
    const service = new ModelService(models, runtimes);

    await expect(service.writeConfig({ providers: {} })).rejects.toBe(failure);

    expect(invalidateModelConfig).not.toHaveBeenCalled();
  });
});

function modelProviderStub(
  overrides: Partial<ModelProvider> = {},
): ModelProvider & { writeConfig: ReturnType<typeof vi.fn> } {
  return {
    listAvailable: vi.fn(async () => []),
    getDefault: vi.fn(async () => null),
    readConfig: vi.fn(async () => ({})),
    writeConfig: vi.fn(async () => {}),
    discoverModels: vi.fn(),
    testConfig: vi.fn(),
    ...overrides,
  } as ModelProvider & { writeConfig: ReturnType<typeof vi.fn> };
}

function runtimeRegistryStub(
  invalidateModelConfig: (invalidation: unknown) => void,
): AgentRuntimeRegistry {
  return {
    get: vi.fn(),
    getOrStart: vi.fn(),
    register: vi.fn(),
    remove: vi.fn(),
    destroy: vi.fn(),
    touch: vi.fn(),
    invalidateModelConfig,
    reloadAgentSettings: vi.fn(),
  };
}
