import type { BinaryFile, ByteRange } from "@/server/domain/workspace";

export function pipelineMediaResponse(request: Request, file: BinaryFile): Response {
  const rangeHeader = request.headers.get("range");
  const range = rangeHeader ? parseRange(rangeHeader, file.size) : null;
  const headers = {
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "Content-Type": file.contentType,
  };
  if (rangeHeader && !range) {
    return new Response(null, {
      status: 416,
      headers: { ...headers, "Content-Range": `bytes */${file.size}` },
    });
  }
  return new Response(file.createStream(range ?? undefined), {
    status: range ? 206 : 200,
    headers: {
      ...headers,
      "Content-Length": String(range ? range.end - range.start + 1 : file.size),
      ...(range ? { "Content-Range": `bytes ${range.start}-${range.end}/${file.size}` } : {}),
    },
  });
}

function parseRange(value: string, size: number): ByteRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2]) || size === 0) return null;
  const suffix = !match[1];
  const first = Number(match[1] || match[2]);
  const last = match[2] && !suffix ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) return null;
  const start = suffix ? Math.max(0, size - first) : first;
  const end = suffix ? size - 1 : Math.min(last, size - 1);
  if (suffix && first === 0) return null;
  if (start > end || start >= size) return null;
  return { start, end };
}
