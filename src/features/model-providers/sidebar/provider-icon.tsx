"use client";

import {
  Server,
  Sparkles,
  Zap,
  Flame,
  Cloud,
  Bot,
  Brain,
  Cpu,
  Globe,
  Key,
  Aperture,
  Hexagon,
} from "@/components/icons";

type IconComponent = React.ComponentType<{
  size?: number;
  style?: React.CSSProperties;
}>;

// 将 provider ID 映射到统一的 Lucide 图标语义。
const PROVIDER_ICONS: Record<string, { Icon: IconComponent; hasColor: boolean }> = {
  anthropic: { Icon: Sparkles, hasColor: false },
  openai: { Icon: Zap, hasColor: false },
  "openai-codex": { Icon: Zap, hasColor: false },
  google: { Icon: Globe, hasColor: false },
  "google-vertex": { Icon: Globe, hasColor: false },
  deepseek: { Icon: Brain, hasColor: false },
  groq: { Icon: Zap, hasColor: false },
  mistral: { Icon: WindIcon, hasColor: false },
  moonshotai: { Icon: Aperture, hasColor: false },
  "moonshotai-cn": { Icon: Aperture, hasColor: false },
  moonshot: { Icon: Aperture, hasColor: false },
  minimax: { Icon: Bot, hasColor: false },
  "minimax-cn": { Icon: Bot, hasColor: false },
  fireworks: { Icon: Flame, hasColor: false },
  huggingface: { Icon: HuggingFaceIcon, hasColor: false },
  cerebras: { Icon: Cpu, hasColor: false },
  openrouter: { Icon: Hexagon, hasColor: false },
  xai: { Icon: Sparkles, hasColor: false },
  "cloudflare-ai-gateway": { Icon: Cloud, hasColor: false },
  "cloudflare-workers-ai": { Icon: Cloud, hasColor: false },
  "vercel-ai-gateway": { Icon: Server, hasColor: false },
  "github-copilot": { Icon: Bot, hasColor: false },
  "amazon-bedrock": { Icon: Cloud, hasColor: false },
  "azure-openai-responses": { Icon: Server, hasColor: false },
  "kimi-coding": { Icon: Key, hasColor: false },
  qwen: { Icon: Sparkles, hasColor: false },
  zai: { Icon: Bot, hasColor: false },
  cohere: { Icon: Hexagon, hasColor: false },
  perplexity: { Icon: Brain, hasColor: false },
  together: { Icon: Globe, hasColor: false },
  grok: { Icon: Sparkles, hasColor: false },
};

// Simple fallback icons for providers without a mapped icon
function WindIcon({ size, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg
      width={size ?? 16}
      height={size ?? 16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <path d="M12.8 19.6A2 2 0 1 0 14 16H2" />
      <path d="M17.5 8a2.5 2.5 0 1 1 2 4H2" />
      <path d="M9.8 4.4A2 2 0 1 1 11 8H2" />
    </svg>
  );
}

function HuggingFaceIcon({ size, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg
      width={size ?? 16}
      height={size ?? 16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
      <path d="M8 10h.01" />
      <path d="M16 10h.01" />
      <path d="M9 15c1 1 2 1.5 3 1.5s2-.5 3-1.5" />
    </svg>
  );
}

interface ProviderIconProps {
  id: string;
  size?: number;
}

export function ProviderIcon({ id, size = 16 }: ProviderIconProps) {
  const pi = PROVIDER_ICONS[id];
  if (!pi) {
    return <Server size={size} style={{ color: "var(--text-dim)", flexShrink: 0 }} />;
  }
  const color = pi.hasColor ? undefined : "var(--text-muted)";
  return <pi.Icon size={size} style={{ color, flexShrink: 0 }} />;
}
