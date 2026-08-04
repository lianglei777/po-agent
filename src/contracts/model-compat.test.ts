import { describe, expect, it } from "vitest";
import { en } from "@/i18n/dictionaries/en";
import { zh } from "@/i18n/dictionaries/zh";
import {
  getChatApi,
  getCompatFields,
  getEffectiveApi,
  MODEL_API_PROTOCOLS,
  sanitizeCompat,
  sanitizeModelsConfig,
} from "./model-compat";

describe("model compatibility contract", () => {
  it("exposes supportsDeveloperRole only for openai-completions", () => {
    expect(
      getCompatFields("openai-completions").some(
        (field) => field.key === "supportsDeveloperRole",
      ),
    ).toBe(true);
    expect(
      getCompatFields("openai-responses").some(
        (field) => field.key === "supportsDeveloperRole",
      ),
    ).toBe(false);
    expect(
      getCompatFields("anthropic-messages").some(
        (field) => field.key === "supportsDeveloperRole",
      ),
    ).toBe(false);
  });

  it("marks supportsDeveloperRole as a bounded boolean defaulting to false", () => {
    const field = getCompatFields("openai-completions").find(
      (f) => f.key === "supportsDeveloperRole",
    );
    expect(field).toBeDefined();
    expect(field?.kind).toBe("boolean");
    if (field?.kind === "boolean") {
      expect(field.defaultValue).toBe(false);
    }
  });

  it("uses a model api override before the provider api", () => {
    expect(getEffectiveApi("openai-completions", "anthropic-messages")).toBe(
      "anthropic-messages",
    );
    expect(getEffectiveApi("openai-responses", undefined)).toBe(
      "openai-responses",
    );
  });

  it("removes fields that do not belong to the selected protocol", () => {
    expect(
      sanitizeCompat("openai-responses", {
        sendSessionIdHeader: false,
        supportsDeveloperRole: false,
        supportsLongCacheRetention: true,
      }),
    ).toEqual({
      sendSessionIdHeader: false,
      supportsLongCacheRetention: true,
    });
    expect(
      sanitizeCompat("anthropic-messages", {
        supportsDeveloperRole: false,
      }),
    ).toBeUndefined();
  });

  it("removes invalid enum and object values", () => {
    expect(
      sanitizeCompat("openai-completions", {
        maxTokensField: "invalid",
        thinkingFormat: "deepseek",
        openRouterRouting: [],
        supportsStore: "yes",
      }),
    ).toEqual({ thinkingFormat: "deepseek", supportsDeveloperRole: false });
  });

  it("defaults supportsDeveloperRole to false for openai-completions", () => {
    // 无 compat 时默认 false
    expect(sanitizeCompat("openai-completions", undefined)).toEqual({
      supportsDeveloperRole: false,
    });
    // compat 中未设置时默认 false
    expect(
      sanitizeCompat("openai-completions", { supportsStore: true }),
    ).toEqual({
      supportsStore: true,
      supportsDeveloperRole: false,
    });
    // 显式 true 时保留 true
    expect(
      sanitizeCompat("openai-completions", { supportsDeveloperRole: true }),
    ).toEqual({ supportsDeveloperRole: true });
    // 显式 false 时保持 false
    expect(
      sanitizeCompat("openai-completions", { supportsDeveloperRole: false }),
    ).toEqual({ supportsDeveloperRole: false });
    // 非 openai-completions 协议不受影响
    expect(
      sanitizeCompat("openai-responses", { sendSessionIdHeader: true }),
    ).toEqual({ sendSessionIdHeader: true });
  });

  it("sanitizes provider and model compat using their effective api", () => {
    expect(
      sanitizeModelsConfig({
        providers: {
          custom: {
            api: "openai-completions",
            compat: {
              supportsDeveloperRole: false,
              sendSessionIdHeader: true,
            },
            models: [
              {
                id: "claude-proxy",
                api: "anthropic-messages",
                compat: {
                  supportsDeveloperRole: false,
                  supportsCacheControlOnTools: false,
                },
              },
            ],
          },
        },
      }),
    ).toEqual({
      providers: {
        custom: {
          api: "openai-completions",
          compat: { supportsDeveloperRole: false },
          models: [
            {
              id: "claude-proxy",
              api: "anthropic-messages",
              compat: { supportsCacheControlOnTools: false },
            },
          ],
        },
      },
    });
  });

  it("rejects unknown api values in strict mode", () => {
    expect(() =>
      sanitizeModelsConfig(
        {
          providers: {
            custom: { api: "future-api" },
          },
        },
        { strictApi: true },
      ),
    ).toThrow("Unsupported API protocol: future-api");
  });

  it("ships a compat field description for every field of every protocol", () => {
    // 字段描述键约定为 `${api}.${fieldKey}`，必须在中英字典中都存在，
    // 避免新增兼容性字段时遗漏用户可见说明。
    const enDescriptions = en.models.compatFieldDescriptions as Record<
      string,
      unknown
    >;
    const zhDescriptions = zh.models.compatFieldDescriptions as Record<
      string,
      unknown
    >;
    for (const api of MODEL_API_PROTOCOLS) {
      for (const field of getCompatFields(api)) {
        const key = `${api}.${field.key}`;
        expect(enDescriptions[key], key).toBeTypeOf("string");
        expect(zhDescriptions[key], key).toBeTypeOf("string");
      }
    }
  });

  it("treats anthropic-ark the same as anthropic-messages for compat fields", () => {
    expect(getCompatFields("anthropic-ark")).toEqual(
      getCompatFields("anthropic-messages"),
    );
  });

  it("maps anthropic-ark to anthropic-messages via getChatApi", () => {
    expect(getChatApi("anthropic-ark")).toBe("anthropic-messages");
    expect(getChatApi("anthropic-messages")).toBe("anthropic-messages");
    expect(getChatApi("openai-completions")).toBe("openai-completions");
    expect(getChatApi(undefined)).toBeUndefined();
  });

  it("sanitizes anthropic-ark provider by setting model api to anthropic-messages", () => {
    expect(
      sanitizeModelsConfig({
        providers: {
          "volcengine-ark": {
            api: "anthropic-ark",
            baseUrl: "https://ark.cn-beijing.volces.com/api/coding",
            apiKey: "ark-test",
            models: [
              { id: "doubao-pro-32k" },
              { id: "deepseek-r1", api: "anthropic-messages" },
            ],
          },
        },
      }),
    ).toEqual({
      providers: {
        "volcengine-ark": {
          api: "anthropic-ark",
          baseUrl: "https://ark.cn-beijing.volces.com/api/coding",
          apiKey: "ark-test",
          models: [
            { id: "doubao-pro-32k", api: "anthropic-messages" },
            { id: "deepseek-r1", api: "anthropic-messages" },
          ],
        },
      },
    });
  });
});
