const TOOLBAR_SCREEN_SPACE = 60;

export function calculateTextEditingViewport({
  currentZoom,
  nodeWidth,
  nodeHeight,
  viewportWidth,
  viewportHeight,
}: {
  currentZoom: number;
  nodeWidth: number;
  nodeHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}) {
  const availableWidth = Math.max(480, viewportWidth - 160);
  const availableHeight = Math.max(360, viewportHeight - 180);
  const fitZoom = Math.min(
    availableWidth / (nodeWidth + 160),
    (availableHeight - TOOLBAR_SCREEN_SPACE) / (nodeHeight + 80),
  );
  // 小节点进入编辑态时适度放大；大型节点仍优先完整显示，且不修改节点持久化尺寸。
  const zoom = Math.min(1.45, Math.max(0.75, Math.min(
    fitZoom,
    Math.max(currentZoom, 1.35),
  )));

  return {
    zoom,
    centerOffsetY: -TOOLBAR_SCREEN_SPACE / (2 * zoom),
  };
}
