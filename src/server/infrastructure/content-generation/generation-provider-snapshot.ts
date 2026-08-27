import type { JsonValue } from "@/contracts/generation";

const SNAPSHOT_LIMIT_BYTES = 64 * 1024;
const SNAPSHOT_PREVIEW_BYTES = 60 * 1024;

export function createGenerationProviderSnapshot(value: unknown): JsonValue {
  const sanitized = toJsonValue(value);
  const json = JSON.stringify(sanitized);
  const sizeBytes = Buffer.byteLength(json, "utf8");
  if (sizeBytes <= SNAPSHOT_LIMIT_BYTES) return sanitized;
  // 快照会经轮询反复写入 SQLite 并回传 UI，必须有硬上限防止大响应放大资源占用。
  return {
    truncated: true,
    originalSizeBytes: sizeBytes,
    preview: Buffer.from(json, "utf8")
      .subarray(0, SNAPSHOT_PREVIEW_BYTES)
      .toString("utf8"),
  };
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") return sanitizeSnapshotString(value);
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        isSensitiveSnapshotKey(key) ? "[REDACTED]" : toJsonValue(item),
      ]),
    );
  }
  return String(value);
}

function sanitizeSnapshotString(value: string): string {
  if (!/^https?:\/\//i.test(value)) return value;
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (isSensitiveSnapshotKey(key)) url.searchParams.set(key, "[REDACTED]");
    }
    return url.toString();
  } catch {
    return value;
  }
}

function isSensitiveSnapshotKey(key: string): boolean {
  return /api[-_]?key|access[-_]?key|authorization|auth|token|secret|sign|identify|credential|password|passwd|cookie/i.test(key);
}
