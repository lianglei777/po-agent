import type { CanvasNode } from "@/contracts/pipeline";

const DERIVED_NODE_SIZE = 350;

export function findDerivedImagePosition(source: CanvasNode, nodes: CanvasNode[]) {
  const startX = source.positionX + (source.width ?? DERIVED_NODE_SIZE) + 120;
  const startY = source.positionY;
  for (let index = 0; index < 40; index += 1) {
    const column = Math.floor(index / 5);
    const row = index % 5;
    const position = {
      x: startX + column * (DERIVED_NODE_SIZE + 100),
      y: startY + row * (DERIVED_NODE_SIZE + 80),
    };
    if (!nodes.some((node) => overlapsNode(position, node))) return position;
  }
  return { x: startX, y: startY + 5 * (DERIVED_NODE_SIZE + 80) };
}

function overlapsNode(position: { x: number; y: number }, node: CanvasNode) {
  const gap = 32;
  const width = node.width ?? DERIVED_NODE_SIZE;
  const height = node.height ?? DERIVED_NODE_SIZE;
  return position.x < node.positionX + width + gap
    && position.x + DERIVED_NODE_SIZE + gap > node.positionX
    && position.y < node.positionY + height + gap
    && position.y + DERIVED_NODE_SIZE + gap > node.positionY;
}
