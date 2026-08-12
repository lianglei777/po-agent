import type { GenerationArtifactKind } from "@/server/domain/generation";

const MAX_NAME_CHARACTERS = 40;

export function generationOutputName(
  prompt: string,
  kind: GenerationArtifactKind,
) {
  const words = prompt
    .normalize("NFKC")
    .replace(/^(?:(?:请(?:帮我)?|帮我)?(?:生成|制作|创建|绘制|画)(?:一[张段个幅部])?|(?:please\s+)?(?:generate|create|make|draw)(?:\s+an?)?)\s*/i, "")
    .replace(/[`*_#~]/g, " ")
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join("-");
  const concise = Array.from(words).slice(0, MAX_NAME_CHARACTERS).join("")
    .replace(/[-. ]+$/g, "");
  return concise || `generated-${kind}`;
}
