export const WEB_ACCESS_ENABLED_FIELD = "poAgentWebAccessEnabled";

const WEB_ACCESS_TOOL_CONFIG_KEYS = [
  "webSearch",
  "fetchContent",
  "getSearchContent",
  "sourceCheck",
] as const;

type ConfigObject = Record<string, unknown>;

/**
 * Po Agent 的总开关需要同时覆盖 Extension 的所有联网工具，避免仅关闭搜索后仍可直接抓取网页。
 */
export function normalizeWebAccessConfig(config: ConfigObject): {
  config: ConfigObject;
  enabled: boolean;
  changed: boolean;
} {
  const enabled = config[WEB_ACCESS_ENABLED_FIELD] === true;
  const tools = asObject(config.tools);
  let changed = config[WEB_ACCESS_ENABLED_FIELD] !== enabled;
  const nextTools: ConfigObject = { ...tools };

  for (const key of WEB_ACCESS_TOOL_CONFIG_KEYS) {
    const tool = asObject(tools[key]);
    if (tool.enabled !== enabled) changed = true;
    nextTools[key] = { ...tool, enabled };
  }

  return {
    config: changed
      ? { ...config, [WEB_ACCESS_ENABLED_FIELD]: enabled, tools: nextTools }
      : config,
    enabled,
    changed,
  };
}

function asObject(value: unknown): ConfigObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as ConfigObject
    : {};
}
