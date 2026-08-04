import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  AuthStorage,
  createAgentSession,
  getAgentDir,
  ModelRegistry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import {
  getModels,
  getProviders,
  getSupportedThinkingLevels,
} from "@earendil-works/pi-ai";
import type { ThinkingLevel } from "@/server/domain/agent-command";
import type {
  DiscoverModelsInput,
  DiscoverModelsResult,
  ModelInfo,
  TestModelInput,
  TestModelResult,
} from "@/server/domain/model";
import type { ModelProvider } from "@/server/ports/model-provider";
import {
  buildModelDiscoverySuggestions,
  selectFetchModels,
} from "./model-discovery";
import { sanitizeModelsConfig } from "@/contracts/model-compat";
import { evaluateModelTestMessages } from "./model-test-result";
import { mapModelDiagnostic } from "./model-diagnostic-mapper";

export class PiModelProvider implements ModelProvider {
  private readonly auth = AuthStorage.create(
    path.join(getAgentDir(), "auth.json"),
  );

  async listAvailable(): Promise<ModelInfo[]> {
    const config = await this.readConfig();
    const thinkingDefaults = getThinkingDefaultLevels(config);
    const registry = ModelRegistry.create(
      this.auth,
      path.join(getAgentDir(), "models.json"),
    );
    return registry.getAvailable().map((model) => ({
      id: model.id,
      name: model.name,
      provider: model.provider,
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
      input: model.input,
      thinkingLevels: [
        "auto",
        ...getSupportedThinkingLevels(model),
      ] as ThinkingLevel[],
      thinkingDefaultLevel: thinkingDefaults.get(
        modelRequestKey(model.provider, model.id),
      ),
      thinkingLevelMap: model.thinkingLevelMap,
    }));
  }

  async getDefault(): Promise<{
    provider: string;
    modelId: string;
  } | null> {
    const first = (await this.listAvailable())[0];
    return first ? { provider: first.provider, modelId: first.id } : null;
  }

  async readConfig(): Promise<Record<string, unknown>> {
    try {
      return JSON.parse(
        await fs.readFile(path.join(getAgentDir(), "models.json"), "utf8"),
      ) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  async writeConfig(config: Record<string, unknown>): Promise<void> {
    const filePath = path.join(getAgentDir(), "models.json");
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`);
    await fs.rename(temporary, filePath);
  }

  async discoverModels(
    input: DiscoverModelsInput,
  ): Promise<DiscoverModelsResult> {
    return buildModelDiscoverySuggestions(input, {
      fetchModels: selectFetchModels(input.provider.api),
      catalogModels: getProviders().flatMap((provider) => getModels(provider)),
    });
  }

  async testConfig(input: TestModelInput): Promise<TestModelResult> {
    const started = Date.now();
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pi-model-"));
    const configPath = path.join(directory, "models.json");
    let session:
      | Awaited<ReturnType<typeof createAgentSession>>["session"]
      | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let modelApi: string | undefined;
    let modelCompat: Record<string, unknown> | undefined;
    try {
      if (input.config) {
        // 清洗配置：将 anthropic-ark 等 discovery 协议映射为 pi-ai 可识别的聊天协议
        const sanitized = sanitizeModelsConfig(input.config);
        await fs.writeFile(configPath, JSON.stringify(sanitized));
      }
      const registry = ModelRegistry.create(this.auth, configPath);
      const model = registry.find(input.provider, input.modelId);
      if (!model) {
        return failedTestResult(
          started,
          input,
          undefined,
          undefined,
          "Model not found in test configuration",
        );
      }
      modelApi = model.api;
      modelCompat = model.compat as Record<string, unknown> | undefined;
      ({ session } = await createAgentSession({
        cwd: directory,
        sessionManager: SessionManager.inMemory(directory),
        model,
        noTools: "all",
      }));
      session.setAutoRetryEnabled(false);
      const timeoutMs = input.timeoutMs ?? 15_000;
      await Promise.race([
        session.prompt("Reply with OK only."),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            void session?.abort();
            reject(new Error("Model test timed out"));
          }, timeoutMs);
        }),
      ]);
      const evaluation = evaluateModelTestMessages(session.messages);
      const latencyMs = Date.now() - started;
      if (!evaluation.ok) {
        return failedTestResult(
          started,
          input,
          modelApi,
          modelCompat,
          evaluation.error,
          latencyMs,
        );
      }
      return {
        ...evaluation,
        latencyMs,
        verification: {
          status: "verified",
          scenario: "basic-chat",
          checkedAt: new Date().toISOString(),
          latencyMs,
        },
      };
    } catch (error) {
      return failedTestResult(
        started,
        input,
        modelApi,
        modelCompat,
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      if (timeout) clearTimeout(timeout);
      session?.dispose();
      await fs.rm(directory, { recursive: true, force: true });
    }
  }
}

function failedTestResult(
  started: number,
  input: TestModelInput,
  api: string | undefined,
  compat: Record<string, unknown> | undefined,
  error: string,
  measuredLatency?: number,
): TestModelResult {
  const latencyMs = measuredLatency ?? Date.now() - started;
  const diagnostic = mapModelDiagnostic({
    api,
    compat,
    errorMessage: error,
    provider: input.provider,
    model: input.modelId,
  });
  return {
    ok: false,
    error: diagnostic.summary,
    latencyMs,
    verification: {
      status: "failed",
      scenario: "basic-chat",
      checkedAt: new Date().toISOString(),
      latencyMs,
    },
    diagnostic,
  };
}

function modelRequestKey(provider: string, modelId: string) {
  return `${provider}:${modelId}`;
}

function getThinkingDefaultLevels(config: Record<string, unknown>) {
  const defaults = new Map<string, Exclude<ThinkingLevel, "auto" | "off">>();
  const providers =
    typeof config.providers === "object" && config.providers !== null
      ? (config.providers as Record<string, unknown>)
      : {};
  for (const [providerName, providerValue] of Object.entries(providers)) {
    if (typeof providerValue !== "object" || providerValue === null) continue;
    const models = (providerValue as { models?: unknown }).models;
    if (!Array.isArray(models)) continue;
    for (const model of models) {
      if (typeof model !== "object" || model === null) continue;
      const entry = model as {
        id?: unknown;
        thinkingDefaultLevel?: unknown;
      };
      if (
        typeof entry.id === "string" &&
        isConfiguredThinkingLevel(entry.thinkingDefaultLevel)
      ) {
        defaults.set(
          modelRequestKey(providerName, entry.id),
          entry.thinkingDefaultLevel,
        );
      }
    }
  }
  return defaults;
}

function isConfiguredThinkingLevel(
  value: unknown,
): value is Exclude<ThinkingLevel, "auto" | "off"> {
  return (
    value === "minimal" ||
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "xhigh"
  );
}
