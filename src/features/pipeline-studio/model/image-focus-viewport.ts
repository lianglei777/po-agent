export function calculateImageFocusViewport(input: {
  currentZoom: number;
  nodeWidth: number;
  nodeHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}) {
  const horizontalZoom = Math.max(0.05, (input.viewportWidth - 280) / input.nodeWidth);
  const verticalZoom = Math.max(0.05, (input.viewportHeight - 220) / input.nodeHeight);
  const fittedZoom = Math.min(horizontalZoom, verticalZoom, 1.6);
  return Math.max(input.currentZoom, Math.min(1.6, Math.max(0.85, fittedZoom)));
}
