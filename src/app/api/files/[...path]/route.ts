import type {
  FileWatchEvent,
  ListFilesResponse,
  ReadTextFileResponse,
} from "@/contracts/files";
import { container } from "@/server/composition/container";
import { AppError } from "@/server/domain/app-error";
import { protectedRoute } from "@/app/api/_route";
import { createSseResponse } from "@/server/transport/sse/sse-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, context: Context) {
  return protectedRoute<ListFilesResponse | ReadTextFileResponse>(async () => {
    const url = new URL(request.url);
    const type = url.searchParams.get("type") ?? "list";
    const targetPath = await requestedPath(url, context);

    if (type === "watch") {
      return createSseResponse<FileWatchEvent>({
        request,
        eventName: "file",
        initial: { type: "connected", path: targetPath },
        subscribe: (emit) => container.fileService.watch(targetPath, emit),
      });
    }
    if (type === "raw" || type === "binary") {
      const file = await container.fileService.getBinary(targetPath);
      const range = parseRange(request.headers.get("range"), file.size);
      return new Response(file.createStream(range ?? undefined), {
        status: range ? 206 : 200,
        headers: {
          "Accept-Ranges": "bytes",
          "Content-Length": String(
            range ? range.end - range.start + 1 : file.size,
          ),
          "Content-Type": file.contentType,
          ...(range
            ? {
                "Content-Range": `bytes ${range.start}-${range.end}/${file.size}`,
              }
            : {}),
        },
      });
    }
    if (type === "read") return container.fileService.readText(targetPath);
    return container.fileService.list(targetPath);
  });
}

async function requestedPath(url: URL, context: Context): Promise<string> {
  const queryPath = url.searchParams.get("path");
  if (queryPath) return queryPath;
  const params = await context.params;
  return params.path.join("/");
}

function parseRange(value: string | null, size: number) {
  if (!value) return null;
  const match = value.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) {
    throw new AppError("VALIDATION_ERROR", "Invalid Range header", 416);
  }
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    end >= size
  ) {
    throw new AppError("VALIDATION_ERROR", "Range is out of bounds", 416);
  }
  return { start, end };
}
