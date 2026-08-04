import type {
  CreateContentGenerationJobResponse,
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
    const files = await Promise.all(
      form.getAll("files").map(async (value) => {
        if (!(value instanceof File)) {
          throw new AppError("VALIDATION_ERROR", "files must contain files", 400);
        }
        if (value.size > 50 * 1024 * 1024) {
          throw new AppError("FILE_TOO_LARGE", "Uploaded file exceeds 50 MB", 413);
        }
        return {
          name: value.name,
          mimeType: value.type || "application/octet-stream",
          data: new Uint8Array(await value.arrayBuffer()),
        };
      }),
    );
    return container.contentGenerationService.createJob({
      sessionId: id,
      prompt,
      files,
    });
  });
}
