import { getBezierPath, Position, useViewport, type ConnectionLineComponentProps } from "@xyflow/react";

type ConnectionLinePathInput = Pick<
  ConnectionLineComponentProps,
  "fromX" | "fromY" | "fromPosition" | "pointer"
>;

export function canvasConnectionPointerToFlowPosition(
  pointer: ConnectionLineComponentProps["pointer"],
  viewport: { x: number; y: number; zoom: number },
) {
  return {
    x: (pointer.x - viewport.x) / viewport.zoom,
    y: (pointer.y - viewport.y) / viewport.zoom,
  };
}

export function studioCanvasConnectionLinePath({
  fromX,
  fromY,
  fromPosition,
  pointer,
}: ConnectionLinePathInput): string {
  // 目标 Handle 虽覆盖整张节点卡片，预览线仍应跟随指针；松开后才锚定到左侧输入点。
  return getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: pointer.x,
    targetY: pointer.y,
    targetPosition: Position.Left,
  })[0];
}

export function StudioCanvasConnectionLine({
  fromX,
  fromY,
  fromPosition,
  pointer,
  connectionLineStyle,
}: ConnectionLineComponentProps) {
  const viewport = useViewport();
  const flowPointer = canvasConnectionPointerToFlowPosition(pointer, viewport);

  return (
    <path
      d={studioCanvasConnectionLinePath({ fromX, fromY, fromPosition, pointer: flowPointer })}
      fill="none"
      className="react-flow__connection-path"
      style={connectionLineStyle}
    />
  );
}
