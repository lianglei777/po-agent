export function generationOptionVisual(value: string | number | boolean) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d+)\s*[:*x×]\s*(\d+)$/i);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height) return null;
  const divisor = greatestCommonDivisor(width, height);
  return {
    dimensions: `${width}×${height}`,
    height,
    ratio: `${width / divisor}:${height / divisor}`,
    width,
  };
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = left;
  let b = right;
  while (b) [a, b] = [b, a % b];
  return a;
}
