"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import type { StudioFlowNode } from "../model/studio-flow-nodes";
import { TextCanvasNode } from "./text-canvas-node";
import { ImageCanvasNode } from "./image-canvas-node";
import { VideoCanvasNode } from "./video-canvas-node";
import { AudioCanvasNode } from "./audio-canvas-node";

function StudioNodeComponent({ id, data, selected, dragging }: NodeProps<StudioFlowNode>) {
  const node = data.canvasNode;
  const canvas = node.data;

  if (!canvas) return null;
  if (canvas.type === "text") {
    return <TextCanvasNode id={id} node={node} selected={selected} dragging={dragging} />;
  }
  if (canvas.type === "image") {
    return <ImageCanvasNode id={id} node={node} selected={selected} dragging={dragging} />;
  }
  if (canvas.type === "video") {
    return <VideoCanvasNode id={id} node={node} selected={selected} dragging={dragging} />;
  }
  return <AudioCanvasNode id={id} node={node} selected={selected} dragging={dragging} />;
}

export const StudioCanvasNode = memo(StudioNodeComponent);
export const studioNodeTypes = { studio: StudioCanvasNode };
