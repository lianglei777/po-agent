import type {
  CreateContentGenerationJobResponse,
  JsonValue,
  ListContentGenerationJobsResponse,
} from "@/contracts/content-generation";
import { container } from "@/server/composition/container";
import { AppError } from "@/server/domain/app-error";
import { handleRoute } from "@/server/transport/http/api-response";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return handleRoute<ListContentGenerationJobsResponse>(async () => {
    const { id } = await context.params;
    return container.contentGenerationService.listJobs(id);
  });
}

export async function POST(request: Request, context: Context) {
  return handleRoute<CreateContentGenerationJobResponse>(async () => {
    const { id } = await context.params;
    const form = await request.formData();
    const prompt = form.get("prompt");
    if (typeof prompt !== "string") {
      throw new AppError("VALIDATION_ERROR", "prompt is required", 400);
    }
    const parameters = parseParameters(form.get("parameters"));
    const slots = form.getAll("fileSlots");
    const fileValues = form.getAll("files");
    if (slots.length !== fileValues.length) {
      throw new AppError("VALIDATION_ERROR", "Each file must have an asset slot", 400);
    }
    const files = await Promise.all(
      fileValues.map(async (value, index) => {
        if (!(value instanceof File)) {
          throw new AppError("VALIDATION_ERROR", "files must contain files", 400);
        }
        const slot = slots[index];
        if (typeof slot !== "string" || !slot.trim()) {
          throw new AppError("VALIDATION_ERROR", "fileSlots must contain slot names", 400);
        }
        if (value.size > 50 * 1024 * 1024) {
          throw new AppError("FILE_TOO_LARGE", "Uploaded file exceeds 50 MB", 413);
        }
        return {
          slot,
          name: value.name,
          mimeType: value.type || "application/octet-stream",
          data: new Uint8Array(await value.arrayBuffer()),
        };
      }),
    );
    return container.contentGenerationService.createJob({
      sessionId: id,
      prompt,
      parameters,
      files,
    });
  });
}

function parseParameters(value: FormDataEntryValue | null): Record<string, JsonValue> {
  if (value === null) return {};
  if (typeof value !== "string") {
    throw new AppError("VALIDATION_ERROR", "parameters must be JSON", 400);
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error();
    }
    return Object.fromEntries(
      Object.entries(parsed).map(([key, item]) => [key, parseJsonValue(item, key)]),
    );
  } catch {
    throw new AppError("VALIDATION_ERROR", "parameters must be a JSON object", 400);
  }
}

function parseJsonValue(value: unknown, name: string): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((item, index) => parseJsonValue(item, `${name}[${index}]`));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, parseJsonValue(item, `${name}.${key}`)]),
    );
  }
  throw new AppError("VALIDATION_ERROR", `${name} must contain JSON values`, 400);
}
