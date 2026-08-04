import type { Api, Model } from "@earendil-works/pi-ai";
import { getChatApi } from "@/contracts/model-compat";
import type {
  DiscoverModelsInput,
  DiscoverModelsResult,
  ModelDiscoverySuggestion,
} from "@/server/domain/model";

interface RemoteModel {
  id: string;
  name?: string;
}

interface FetchModelsInput {
  baseUrl: string;
  apiKey?: string;
  headers?: Record<string, string>;
}

interface DiscoveryDependencies {
  fetchModels: (input: FetchModelsInput) => Promise<RemoteModel[]>;
  catalogModels: Model<Api>[];
}

const DEFAULT_MODEL = {
  reasoning: false,
  input: ["text"] as Array<"text" | "image">,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128000,
  maxTokens: 16384,
};

export async function buildModelDiscoverySuggestions(
  input: DiscoverModelsInput,
  dependencies: DiscoveryDependencies,
): Promise<DiscoverModelsResult> {
  const provider = input.provider;
  const providerCatalog = dependencies.catalogModels.filter(
    (model) => model.provider === input.providerName,
  );

  let remoteModels: RemoteModel[] = [];
  let remoteError: string | undefined;
  if (provider.baseUrl && isRemoteDiscoverable(provider.api)) {
    try {
      remoteModels = await dependencies.fetchModels({
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        headers: provider.headers,
      });
    } catch (error) {
      remoteError = error instanceof Error ? error.message : String(error);
    }
  }

  if (remoteModels.length === 0) {
    return {
      models: providerCatalog.map((model) =>
        fromCatalogModel(model, provider.api),
      ),
      remoteError,
    };
  }

  const suggestions = remoteModels.map((remoteModel) => {
    const catalogModel = findCatalogMatch(
      dependencies.catalogModels,
      input.providerName,
      remoteModel.id,
    );
    return catalogModel
      ? fromCatalogModel(catalogModel, provider.api, remoteModel)
      : fromRemoteModel(remoteModel, provider.api);
  });

  return { models: dedupeSuggestions(suggestions), remoteError };
}

export async function fetchOpenAICompatibleModels({
  baseUrl,
  apiKey,
  headers,
}: FetchModelsInput): Promise<RemoteModel[]> {
  const response = await fetch(modelsUrl(baseUrl), {
    headers: {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...headers,
    },
  });
  if (!response.ok) {
    throw new Error(`Model discovery failed (${response.status})`);
  }
  const data = (await response.json()) as unknown;
  const models = parseRemoteModels(data);
  if (models.length === 0) {
    throw new Error("Model discovery returned no models");
  }
  return models;
}

// Anthropic 官方 API：x-api-key 认证，display_name 字段，端点 /v1/models
export async function fetchAnthropicModels({
  baseUrl,
  apiKey,
  headers,
}: FetchModelsInput): Promise<RemoteModel[]> {
  const response = await fetch(versionedModelsUrl(baseUrl), {
    headers: {
      "x-api-key": apiKey ?? "",
      "anthropic-version": "2023-06-01",
      ...headers,
    },
  });
  if (!response.ok) {
    throw new Error(`Model discovery failed (${response.status})`);
  }
  const data = (await response.json()) as unknown;
  const models = parseAnthropicModels(data);
  if (models.length === 0) {
    throw new Error("Model discovery returned no models");
  }
  return models;
}

// 火山引擎 Ark 兼容：Bearer 认证，OpenAI 响应格式（name 字段），端点 /v1/models
export async function fetchArkModels({
  baseUrl,
  apiKey,
  headers,
}: FetchModelsInput): Promise<RemoteModel[]> {
  const response = await fetch(versionedModelsUrl(baseUrl), {
    headers: {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...headers,
    },
  });
  if (!response.ok) {
    throw new Error(`Model discovery failed (${response.status})`);
  }
  const data = (await response.json()) as unknown;
  const models = parseRemoteModels(data);
  if (models.length === 0) {
    throw new Error("Model discovery returned no models");
  }
  return models;
}

// 根据 API 协议选择对应的远程模型拉取函数
export function selectFetchModels(
  api: string | undefined,
): (input: FetchModelsInput) => Promise<RemoteModel[]> {
  if (api === "anthropic-messages") return fetchAnthropicModels;
  if (api === "anthropic-ark") return fetchArkModels;
  return fetchOpenAICompatibleModels;
}

function isRemoteDiscoverable(api: string | undefined) {
  return (
    !api ||
    api === "openai-completions" ||
    api === "openai-responses" ||
    api === "anthropic-messages" ||
    api === "anthropic-ark"
  );
}

// OpenAI 约定：baseUrl 已包含版本段（如 /v1），直接追加 /models
function modelsUrl(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, "")}/models`;
}

// Anthropic 约定：baseUrl 不含版本段，需要追加 /v1/models；
// 若 baseUrl 已以 /vN 结尾则只追加 /models
function versionedModelsUrl(baseUrl: string) {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (/\/v\d+$/.test(trimmed)) return `${trimmed}/models`;
  return `${trimmed}/v1/models`;
}

function parseRemoteModels(value: unknown): RemoteModel[] {
  if (!value || typeof value !== "object") return [];
  const data = (value as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  return data.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as { id?: unknown; name?: unknown };
    if (typeof candidate.id !== "string" || !candidate.id.trim()) return [];
    return [
      {
        id: candidate.id,
        name: typeof candidate.name === "string" ? candidate.name : undefined,
      },
    ];
  });
}

// Anthropic 响应中模型名称字段为 display_name
function parseAnthropicModels(value: unknown): RemoteModel[] {
  if (!value || typeof value !== "object") return [];
  const data = (value as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  return data.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as {
      id?: unknown;
      display_name?: unknown;
    };
    if (typeof candidate.id !== "string" || !candidate.id.trim()) return [];
    return [
      {
        id: candidate.id,
        name:
          typeof candidate.display_name === "string"
            ? candidate.display_name
            : undefined,
      },
    ];
  });
}

function findCatalogMatch(
  catalogModels: Model<Api>[],
  providerName: string,
  modelId: string,
) {
  return (
    catalogModels.find(
      (model) => model.provider === providerName && model.id === modelId,
    ) ?? catalogModels.find((model) => model.id === modelId)
  );
}

function fromCatalogModel(
  model: Model<Api>,
  api: string | undefined,
  remoteModel?: RemoteModel,
): ModelDiscoverySuggestion {
  return compactSuggestion({
    verification: "unverified",
    model: {
      id: model.id,
      name: remoteModel?.name ?? model.name,
      reasoning: model.reasoning,
      thinkingLevelMap: model.thinkingLevelMap,
      input: model.input,
      cost: model.cost,
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
      api: getChatApi(api) ?? model.api,
      compat: model.compat as Record<string, unknown> | undefined,
    },
  });
}

function fromRemoteModel(
  remoteModel: RemoteModel,
  api: string | undefined,
): ModelDiscoverySuggestion {
  return compactSuggestion({
    verification: "unverified",
    model: {
      id: remoteModel.id,
      name: remoteModel.name ?? remoteModel.id,
      ...DEFAULT_MODEL,
      reasoning: true,
      api: getChatApi(api),
    },
  });
}

function compactSuggestion(
  suggestion: ModelDiscoverySuggestion,
): ModelDiscoverySuggestion {
  return {
    ...suggestion,
    model: Object.fromEntries(
      Object.entries(suggestion.model).filter(([, value]) => value !== undefined),
    ) as ModelDiscoverySuggestion["model"],
  };
}

function dedupeSuggestions(suggestions: ModelDiscoverySuggestion[]) {
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    const id = suggestion.model.id.trim();
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
