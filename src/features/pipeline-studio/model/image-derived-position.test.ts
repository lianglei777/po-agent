import { describe, expect, it } from "vitest";
import type { CanvasNode } from "@/contracts/pipeline";
import { findDerivedImagePosition } from "./image-derived-position";

const node = (id: string, positionX: number, positionY: number, width = 350, height = 350): CanvasNode => ({
  id,
  projectId: "project-1",
  type: "image",
  entityId: `entity-${id}`,
  positionX,
  positionY,
  width,
  height,
  data: { type: "image", name: id, action: "image_resource" },
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
});

describe("derived image position", () => {
  it("places the result to the right of its source", () => {
    const source = node("source", 100, 80, 480, 300);
    expect(findDerivedImagePosition(source, [source])).toEqual({ x: 700, y: 80 });
  });

  it("moves downward when the preferred position is occupied", () => {
    const source = node("source", 100, 80, 480, 300);
    const occupied = node("occupied", 700, 80);
    expect(findDerivedImagePosition(source, [source, occupied])).toEqual({ x: 700, y: 510 });
  });
});
