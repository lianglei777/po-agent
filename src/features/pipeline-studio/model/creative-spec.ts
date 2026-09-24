import type { CanvasCreativeSpec, CanvasNode, CanvasNodeData } from "@/contracts/pipeline";
import { textDocumentFromPlainText } from "./text-document";

export function renderCreativeSpec(spec: CanvasCreativeSpec): string {
  if (spec.kind === "script") {
    return [
      `# ${spec.title}`,
      `创作目标：${spec.objective}`,
      spec.estimatedDurationSeconds === undefined ? "" : `预计时长：${spec.estimatedDurationSeconds} 秒`,
      spec.characters.length ? `角色：${spec.characters.join("、")}` : "",
    ].filter(Boolean).join("\n\n");
  }
  if (spec.kind === "asset") {
    return [
      `# ${spec.canonicalName}`,
      `类型：${assetTypeLabel(spec.assetType)}`,
      `身份标识：${spec.identityKey}`,
      spec.aliases.length ? `别名：${spec.aliases.join("、")}` : "",
      `视觉设定：${spec.visualDescription}`,
      spec.continuityFacts.length ? `连续性约束：\n${spec.continuityFacts.map((fact) => `- ${fact}`).join("\n")}` : "",
    ].filter(Boolean).join("\n\n");
  }
  return [
    `# 镜头 ${String(spec.order + 1).padStart(2, "0")}`,
    `目的：${spec.purpose}`,
    `时长：${spec.durationSeconds} 秒`,
    `画面：${spec.visual}`,
    spec.subjects.length ? `主体：${spec.subjects.map((subject) => `${subject.identityKey}（${subject.action}${subject.expression ? `，${subject.expression}` : ""}）`).join("；")}` : "",
    spec.dialogue ? `对白：${spec.dialogue.speaker}：${spec.dialogue.line}` : "",
    `景别：${spec.shotSize}`,
    `运镜：${spec.cameraMovement}`,
    `调度：${spec.blocking}`,
    `光线：${spec.lighting}`,
    spec.audio.ambience ? `环境声：${spec.audio.ambience}` : "",
    spec.audio.sfx ? `音效：${spec.audio.sfx}` : "",
    spec.audio.music ? `音乐：${spec.audio.music}` : "",
    spec.transition ? `转场：${spec.transition}` : "",
  ].filter(Boolean).join("\n\n");
}

export function nodeDataWithCreativeSpec(data: CanvasNodeData, spec: CanvasCreativeSpec): CanvasNodeData {
  const text = renderCreativeSpec(spec);
  const name = spec.kind === "script"
    ? spec.title
    : spec.kind === "asset"
      ? spec.canonicalName
      : `镜头 ${String(spec.order + 1).padStart(2, "0")} · ${spec.purpose}`;
  if (spec.kind === "script" && existingText(data).trim()) {
    // Script Spec 仅保存索引元数据，不能用摘要反向覆盖用户已编辑的场景、动作和对白正文。
    return { ...data, name, creativeSpec: spec };
  }
  return { ...data, name, creativeSpec: spec, content: [text], textDocument: textDocumentFromPlainText(text) };
}

function existingText(data: CanvasNodeData): string {
  return data.textDocument?.plainText ?? data.content?.join("\n") ?? "";
}

export function downstreamImpact(sourceNodeId: string, nodes: CanvasNode[], edges: Array<{ sourceNodeId: string; targetNodeId: string }>): CanvasNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visited = new Set<string>([sourceNodeId]);
  const queue = [sourceNodeId];
  const result: CanvasNode[] = [];
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of edges) {
      if (edge.sourceNodeId !== current || visited.has(edge.targetNodeId)) continue;
      visited.add(edge.targetNodeId);
      queue.push(edge.targetNodeId);
      const node = byId.get(edge.targetNodeId);
      if (node) result.push(node);
    }
  }
  return result;
}

function assetTypeLabel(type: Extract<CanvasCreativeSpec, { kind: "asset" }>["assetType"]): string {
  return type === "character" ? "角色" : type === "scene" ? "场景" : "道具";
}
