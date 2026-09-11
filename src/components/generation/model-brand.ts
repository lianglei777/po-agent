// 内容生成模型的品牌解析映射表。
// 这是品牌别名与归一化匹配的唯一持有者：调用方只依赖本模块返回的 brand key，
// 图标渲染由 model-brand-icon.tsx 单点完成，其他任何文件不得直接引用 @lobehub/icons。

export type ModelBrand =
  | "anthropic"
  | "claude"
  | "openai"
  | "google"
  | "gemini"
  | "deepseek"
  | "moonshot"
  | "kimi"
  | "qwen"
  | "happyhorse"
  | "zhipu"
  | "chatglm"
  | "doubao"
  | "jimeng"
  | "minimax"
  | "hailuo"
  | "kling"
  | "pixverse"
  | "vidu"
  | "hunyuan"
  | "grok"
  | "xai"
  | "mistral"
  | "groq"
  | "fireworks"
  | "huggingface"
  | "cerebras"
  | "openrouter"
  | "perplexity"
  | "cohere"
  | "together"
  | "copilot"
  | "cloudflare"
  | "bedrock"
  | "azure"
  | "vercel";

// 别名按品牌归属组织；同一别名允许出现在多个品牌（如 "minimax" 与 "hailuo"），
// 由最长别名优先 + 表内声明顺序共同决定优先级。
const BRAND_ALIASES: ReadonlyArray<{ brand: ModelBrand; aliases: readonly string[] }> = [
  // 通义/千问系（Wan、Z-Image 均为千问平台产品线）。
  { brand: "qwen", aliases: ["qwen", "qianwen", "tongyi", "wan", "z-image", "wanx", "通义", "千问", "万相"] },
  // HappyHorse 是千问平台的模型，但拥有独立品牌标识，按产品线单列。
  { brand: "happyhorse", aliases: ["happyhorse", "happy horse", "快乐马"] },
  // 即梦/字节系（Seedance、Seedream 属即梦产品线，不归到豆包/字节）。
  { brand: "jimeng", aliases: ["jimeng", "seedance", "seedream", "seededit", "即梦"] },
  { brand: "doubao", aliases: ["doubao", "豆包"] },
  // MiniMax 系：Hailuo 独立成条目以便将来切换专属图标，命中顺序在 minimax 之后。
  { brand: "minimax", aliases: ["minimax", "abab"] },
  { brand: "hailuo", aliases: ["hailuo", "海螺"] },
  { brand: "kling", aliases: ["kling", "klingai", "可灵"] },
  { brand: "pixverse", aliases: ["pixverse"] },
  { brand: "vidu", aliases: ["vidu"] },
  { brand: "hunyuan", aliases: ["hunyuan", "腾讯混元", "混元"] },
  // 国际模型与聚合平台。
  { brand: "claude", aliases: ["claude"] },
  { brand: "anthropic", aliases: ["anthropic"] },
  { brand: "openai", aliases: ["openai", "gpt", "codex", "dall-e", "dalle", "o1", "o3", "o4"] },
  { brand: "gemini", aliases: ["gemini"] },
  { brand: "google", aliases: ["google", "palm"] },
  { brand: "deepseek", aliases: ["deepseek"] },
  { brand: "kimi", aliases: ["kimi"] },
  { brand: "moonshot", aliases: ["moonshot"] },
  { brand: "zhipu", aliases: ["zhipu", "glm"] },
  { brand: "chatglm", aliases: ["chatglm"] },
  { brand: "grok", aliases: ["grok"] },
  { brand: "xai", aliases: ["xai"] },
  { brand: "mistral", aliases: ["mistral", "codestral"] },
  { brand: "groq", aliases: ["groq"] },
  { brand: "fireworks", aliases: ["fireworks"] },
  { brand: "huggingface", aliases: ["huggingface", "hugging face"] },
  { brand: "cerebras", aliases: ["cerebras"] },
  { brand: "openrouter", aliases: ["openrouter"] },
  { brand: "perplexity", aliases: ["perplexity"] },
  { brand: "cohere", aliases: ["cohere"] },
  { brand: "together", aliases: ["together"] },
  { brand: "copilot", aliases: ["copilot"] },
  { brand: "cloudflare", aliases: ["cloudflare"] },
  { brand: "bedrock", aliases: ["bedrock"] },
  { brand: "azure", aliases: ["azure"] },
  { brand: "vercel", aliases: ["vercel"] },
];

// 归一化：小写、压缩空白。别名表只含 ASCII 与中文，无需 Unicode 折叠。
function normalizeSignal(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

interface CompiledAlias {
  brand: ModelBrand;
  alias: string;
}

// 编译为按别名长度降序的扁平列表：长别名优先匹配，避免 "o1" 之类短别名误命中
// "moonshot-1" 等无关字符串；同长度保持表内声明顺序（先产品线后平台）。
const COMPILED_ALIASES: readonly CompiledAlias[] = BRAND_ALIASES.flatMap(({ brand, aliases }) =>
  aliases.map((alias) => ({ brand, alias })),
).sort((a, b) => b.alias.length - a.alias.length);

/**
 * 从多个信号（product、模型名、providerId 等，按可信度降序传入）解析品牌。
 * 信号逐个独立匹配，第一个命中即返回，保证高可信信号优先。
 * 未命中返回 undefined，由调用方渲染首字母 fallback。
 */
export function resolveModelBrand(...signals: Array<string | undefined>): ModelBrand | undefined {
  for (const signal of signals) {
    const normalized = normalizeSignal(signal);
    if (!normalized) continue;
    const hit = COMPILED_ALIASES.find((entry) => normalized.includes(entry.alias));
    if (hit) return hit.brand;
  }
  return undefined;
}
