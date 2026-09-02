import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  WEB_SEARCH_FALLBACK_KINDS,
  WEB_SEARCH_PROVIDER_IDS,
  type UpdateWebAccessSettingsRequest,
  type WebAccessSettingsResponse,
  type WebSearchFallbackKind,
  type WebSearchProviderId,
} from "@/contracts/web-access";
import type { WebAccessSettingsStore } from "@/server/ports/web-access-settings";
import { normalizeWebAccessConfig } from "./pi-web-access-config";

type ConfigObject = Record<string, unknown>;

const API_KEY_FIELDS = {
  brave: "braveApiKey",
  tavily: "tavilyApiKey",
  exa: "exaApiKey",
} as const;

const DEFAULT_FALLBACK_ON = [...WEB_SEARCH_FALLBACK_KINDS];

export class PiWebAccessSettingsStore implements WebAccessSettingsStore {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly configPath: string) {}

  async read(): Promise<WebAccessSettingsResponse> {
    const config = await this.readConfig();
    const routing = readRouting(config.searchRouting);
    const enabled = new Set(routing?.providers ?? WEB_SEARCH_PROVIDER_IDS);
    const providerOrder = [
      ...(routing?.providers ?? WEB_SEARCH_PROVIDER_IDS),
      ...WEB_SEARCH_PROVIDER_IDS.filter((id) => !enabled.has(id)),
    ];
    return {
      enabled: config.poAgentWebAccessEnabled === true,
      providers: providerOrder.map((id) => ({
        id,
        enabled: enabled.has(id),
        apiKey: readApiKey(config, id),
      })),
      fallbackOn: routing?.fallbackOn ?? DEFAULT_FALLBACK_ON,
    };
  }

  write(input: UpdateWebAccessSettingsRequest): Promise<void> {
    const operation = this.writeQueue.then(async () => {
      const config = await this.readConfig();
      delete config.provider;
      delete config.searchProvider;

      config.searchRouting = {
        providers: input.providers
          .filter((provider) => provider.enabled)
          .map((provider) => provider.id),
        fallbackOn: input.fallbackOn,
      };

      for (const provider of input.providers) {
        if (provider.id === "duckduckgo") continue;
        const field = API_KEY_FIELDS[provider.id];
        const apiKey = provider.apiKey.trim();
        if (apiKey) config[field] = apiKey;
        else delete config[field];
      }
      config.poAgentWebAccessEnabled = input.enabled;
      await this.writeConfig(normalizeWebAccessConfig(config).config);
    });
    this.writeQueue = operation.catch(() => {});
    return operation;
  }

  private async readConfig(): Promise<ConfigObject> {
    try {
      const value: unknown = JSON.parse(
        await fs.readFile(this.configPath, "utf8"),
      );
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("web-search.json must contain a JSON object");
      }
      return value as ConfigObject;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
  }

  private async writeConfig(config: ConfigObject): Promise<void> {
    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    const temporaryPath = `${this.configPath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(
        temporaryPath,
        `${JSON.stringify(config, null, 2)}\n`,
        { encoding: "utf8", mode: 0o600 },
      );
      await fs.rename(temporaryPath, this.configPath);
    } finally {
      await fs.rm(temporaryPath, { force: true });
    }
  }
}

function readApiKey(config: ConfigObject, id: WebSearchProviderId): string {
  if (id === "duckduckgo") return "";
  const value = config[API_KEY_FIELDS[id]];
  return typeof value === "string" ? value : "";
}

function readRouting(value: unknown): {
  providers: WebSearchProviderId[];
  fallbackOn: WebSearchFallbackKind[];
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const routing = value as ConfigObject;
  if (!Array.isArray(routing.providers) || !Array.isArray(routing.fallbackOn)) {
    return null;
  }
  const providers = routing.providers.filter(
    (provider): provider is WebSearchProviderId =>
      WEB_SEARCH_PROVIDER_IDS.includes(provider as WebSearchProviderId),
  );
  const fallbackOn = routing.fallbackOn.filter(
    (kind): kind is WebSearchFallbackKind =>
      WEB_SEARCH_FALLBACK_KINDS.includes(kind as WebSearchFallbackKind),
  );
  if (fallbackOn.length === 0) return null;
  return { providers, fallbackOn };
}
