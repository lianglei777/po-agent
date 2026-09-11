"use client";

import type { ComponentType, SVGProps } from "react";
import AnthropicMono from "@lobehub/icons/es/Anthropic/components/Mono";
import ClaudeColor from "@lobehub/icons/es/Claude/components/Color";
import OpenAIMono from "@lobehub/icons/es/OpenAI/components/Mono";
import GoogleColor from "@lobehub/icons/es/Google/components/Color";
import GeminiColor from "@lobehub/icons/es/Gemini/components/Color";
import DeepSeekColor from "@lobehub/icons/es/DeepSeek/components/Color";
import MoonshotMono from "@lobehub/icons/es/Moonshot/components/Mono";
import KimiColor from "@lobehub/icons/es/Kimi/components/Color";
import QwenColor from "@lobehub/icons/es/Qwen/components/Color";
import HappyHorseMono from "@lobehub/icons/es/HappyHorse/components/Mono";
import ZhipuColor from "@lobehub/icons/es/Zhipu/components/Color";
import DoubaoColor from "@lobehub/icons/es/Doubao/components/Color";
import JimengColor from "@lobehub/icons/es/Jimeng/components/Color";
import MinimaxColor from "@lobehub/icons/es/Minimax/components/Color";
import KlingColor from "@lobehub/icons/es/Kling/components/Color";
import PixVerseColor from "@lobehub/icons/es/PixVerse/components/Color";
import HunyuanColor from "@lobehub/icons/es/Hunyuan/components/Color";
import GrokMono from "@lobehub/icons/es/Grok/components/Mono";
import MistralColor from "@lobehub/icons/es/Mistral/components/Color";
import GroqMono from "@lobehub/icons/es/Groq/components/Mono";
import FireworksColor from "@lobehub/icons/es/Fireworks/components/Color";
import CerebrasColor from "@lobehub/icons/es/Cerebras/components/Color";
import OpenRouterColor from "@lobehub/icons/es/OpenRouter/components/Color";
import PerplexityColor from "@lobehub/icons/es/Perplexity/components/Color";
import CohereColor from "@lobehub/icons/es/Cohere/components/Color";
import TogetherColor from "@lobehub/icons/es/Together/components/Color";
import GithubCopilotMono from "@lobehub/icons/es/GithubCopilot/components/Mono";
import CloudflareColor from "@lobehub/icons/es/Cloudflare/components/Color";
import BedrockColor from "@lobehub/icons/es/Bedrock/components/Color";
import AzureColor from "@lobehub/icons/es/Azure/components/Color";
import VercelMono from "@lobehub/icons/es/Vercel/components/Mono";
import { resolveModelBrand, type ModelBrand } from "./model-brand";

// 全项目唯一允许 import @lobehub/icons 的文件（eslint no-restricted-imports 强制）。
// 必须使用深路径 `es/<Brand>/components/<Variant>`：
// 1. 品牌根对象会连带 Avatar/Combine，间接引入 @lobehub/ui 与 antd-style；
// 2. 深路径组件是纯 SVG，仅依赖 react 与 es-toolkit。
// 该深路径依赖包内部目录布局，因此 package.json 中必须锁定精确版本。
// 部分品牌（OpenAI、Grok、Vercel 等）官方 logo 本身是单色的，包内只提供 Mono
// 变体（fill=currentColor），与 Color 变体混用不影响视觉一致性。
type BrandIconType = ComponentType<SVGProps<SVGSVGElement> & { size?: string | number }>;

const BRAND_ICONS: Record<ModelBrand, BrandIconType> = {
  anthropic: AnthropicMono,
  claude: ClaudeColor,
  openai: OpenAIMono,
  google: GoogleColor,
  gemini: GeminiColor,
  deepseek: DeepSeekColor,
  moonshot: MoonshotMono,
  kimi: KimiColor,
  qwen: QwenColor,
  happyhorse: HappyHorseMono,
  zhipu: ZhipuColor,
  chatglm: ZhipuColor,
  doubao: DoubaoColor,
  jimeng: JimengColor,
  minimax: MinimaxColor,
  hailuo: MinimaxColor,
  kling: KlingColor,
  pixverse: PixVerseColor,
  vidu: PixVerseColor,
  hunyuan: HunyuanColor,
  grok: GrokMono,
  xai: GrokMono,
  mistral: MistralColor,
  groq: GroqMono,
  fireworks: FireworksColor,
  huggingface: CerebrasColor,
  cerebras: CerebrasColor,
  openrouter: OpenRouterColor,
  perplexity: PerplexityColor,
  cohere: CohereColor,
  together: TogetherColor,
  copilot: GithubCopilotMono,
  cloudflare: CloudflareColor,
  bedrock: BedrockColor,
  azure: AzureColor,
  vercel: VercelMono,
};

export interface ModelBrandIconProps {
  /** 产品线名称（GenerationRouteDto.product），品牌解析的优先信号。 */
  product?: string;
  /** 模型或路由名称，次优先信号。 */
  name?: string;
  /** 供应商 ID（GenerationRouteDto.providerId 或文本模型 provider），兜底信号。 */
  provider?: string;
  className?: string;
}

// 未命中品牌时的首字母 tile：沿用 picker 行内的中性表面样式，避免为未知品牌
// 引入装饰性配色；CJK 首字与拉丁首字母均取第一个字符。
function BrandInitial({ label, className }: { label: string; className?: string }) {
  const initial = label.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      className={`flex size-3.5 items-center justify-center text-[10px] font-semibold leading-none text-[var(--pl-text-secondary)] ${className ?? ""}`}
    >
      {initial}
    </span>
  );
}

/**
 * 按品牌信号渲染模型图标；未命中已知品牌时回退到名称首字母。
 * 图标不含语义信息（模型名就在旁边），统一对屏幕阅读器隐藏。
 */
export function ModelBrandIcon({ product, name, provider, className }: ModelBrandIconProps) {
  const brand = resolveModelBrand(product, name, provider);
  if (!brand) {
    return <BrandInitial label={name ?? product ?? provider ?? ""} className={className} />;
  }
  const Icon = BRAND_ICONS[brand];
  return <Icon aria-hidden="true" className={className} size="1em" />;
}
