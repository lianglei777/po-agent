import type { JsonValue } from "@/contracts/generation";
import type { GenerationInput } from "@/server/domain/generation";
import type { LipSyncFace } from "@/server/domain/pipeline";
import type { LipSyncAnalysisResult, LipSyncProvider } from "@/server/ports/lip-sync-provider";
import { RunningHubAdapter } from "./runninghub-adapter";
import type { RunningHubExecutionConfig } from "./runninghub-catalog";

const IDENTIFY_FACE_OPERATION = "kling-identify-face";
const IDENTIFY_FACE_CONFIG: RunningHubExecutionConfig = {
  protocol: "runninghub-standard-v1",
  operation: IDENTIFY_FACE_OPERATION,
  endpoint: "/openapi/v2/kling-lip-sync/identify-face",
  fields: [{ source: "asset", key: "videoUrl", vendorKey: "videoUrl", serialize: "first" }],
};

export class RunningHubLipSyncProvider implements LipSyncProvider {
  constructor(private readonly adapter = new RunningHubAdapter()) {}

  async submitFaceAnalysis(input: Parameters<LipSyncProvider["submitFaceAnalysis"]>[0]) {
    const prepared = await this.adapter.prepareAssets({
      operation: IDENTIFY_FACE_OPERATION,
      executionConfig: IDENTIFY_FACE_CONFIG as unknown as JsonValue,
      assets: [{ ...input.video, slot: "videoUrl" }],
      credential: input.credential,
    });
    const result = await this.adapter.submit({
      operation: IDENTIFY_FACE_OPERATION,
      executionConfig: IDENTIFY_FACE_CONFIG as unknown as JsonValue,
      generation: { prompt: "" } satisfies GenerationInput,
      assets: prepared,
      credential: input.credential,
    });
    return analysisResult(result);
  }

  async pollFaceAnalysis(input: Parameters<LipSyncProvider["pollFaceAnalysis"]>[0]) {
    const result = await this.adapter.poll({
      operation: IDENTIFY_FACE_OPERATION,
      executionConfig: IDENTIFY_FACE_CONFIG as unknown as JsonValue,
      remoteTaskId: input.remoteTaskId,
      credential: input.credential,
    });
    return analysisResult(result);
  }
}

function analysisResult(result: Awaited<ReturnType<RunningHubAdapter["poll"]>>): LipSyncAnalysisResult {
  if (result.state === "pending") {
    return { state: "pending", remoteTaskId: result.remoteTaskId, rawSnapshot: result.rawSnapshot };
  }
  if (result.state === "failed") {
    return {
      state: "failed",
      remoteTaskId: result.remoteTaskId,
      errorMessage: result.errorMessage ?? "RunningHub face analysis failed",
      rawSnapshot: result.rawSnapshot,
    };
  }
  const parsed = parseKlingFaceAnalysis(result.rawSnapshot, result.outputs.map((output) => output.text));
  if (!parsed?.faces.length) {
    return {
      state: "failed",
      remoteTaskId: result.remoteTaskId,
      errorMessage: "RunningHub face analysis did not return any lip-sync capable faces",
      rawSnapshot: result.rawSnapshot,
    };
  }
  return {
    state: "ready",
    remoteTaskId: result.remoteTaskId,
    providerSessionId: parsed.sessionId,
    faces: parsed.faces,
    rawSnapshot: result.rawSnapshot,
  };
}

export function parseKlingFaceAnalysis(snapshot: JsonValue | undefined, outputTexts: Array<string | undefined>) {
  const roots: unknown[] = [snapshot, ...outputTexts.flatMap((text) => {
    if (!text) return [];
    try { return [JSON.parse(text) as unknown]; } catch { return []; }
  })];
  const records = roots.flatMap(collectRecords);
  const sessionId = firstString(records, ["sessionId", "session_id", "session"]);
  const faceRecords = records.flatMap((record) => {
    for (const key of ["faces", "faceList", "face_list", "faceInfos", "face_infos", "faceData", "face_data"]) {
      if (Array.isArray(record[key])) return record[key] as unknown[];
    }
    return [];
  }).filter(isRecord);
  const faces = faceRecords.map((face, index): LipSyncFace | null => {
    const providerFaceId = valueString(face.faceId ?? face.face_id ?? face.id);
    if (!providerFaceId) return null;
    const interval = isRecord(face.lipSyncTimeRange) ? face.lipSyncTimeRange
      : isRecord(face.lip_sync_time_range) ? face.lip_sync_time_range
        : isRecord(face.timeRange) ? face.timeRange
          : face;
    const start = valueNumber(interval.startTime ?? interval.start_time ?? interval.start ?? face.startTime ?? face.start_time);
    const end = valueNumber(interval.endTime ?? interval.end_time ?? interval.end ?? face.endTime ?? face.end_time);
    if (start === undefined || end === undefined || end - start < 2_000) return null;
    return {
      key: `face-${index + 1}`,
      providerFaceId,
      previewUrl: firstRecordString(face, ["faceImageUrl", "face_image_url", "imageUrl", "image_url", "url"]),
      availableStartMs: Math.round(start),
      availableEndMs: Math.round(end),
    };
  }).filter((face): face is LipSyncFace => Boolean(face));
  return sessionId ? { sessionId, faces } : null;
}

function collectRecords(value: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 8) return [];
  if (typeof value === "string") {
    try { return collectRecords(JSON.parse(value) as unknown, depth + 1); } catch { return []; }
  }
  if (Array.isArray(value)) return value.flatMap((item) => collectRecords(item, depth + 1));
  if (!isRecord(value)) return [];
  return [value, ...Object.values(value).flatMap((item) => collectRecords(item, depth + 1))];
}

function firstString(records: Record<string, unknown>[], keys: string[]) {
  for (const record of records) {
    const value = firstRecordString(record, keys);
    if (value) return value;
  }
  return undefined;
}

function firstRecordString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = valueString(record[key]);
    if (value) return value;
  }
  return undefined;
}

function valueString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim()
    : typeof value === "number" && Number.isFinite(value) ? String(value)
      : undefined;
}

function valueNumber(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
