import { describe, expect, it, vi } from "vitest";
import type { BinaryFile } from "@/server/domain/workspace";
import { pipelineMediaResponse } from "./pipeline-media-response";

const bytes = new Uint8Array([0, 1, 2, 3, 4]);

function file() {
  const createStream = vi.fn((range?: { start: number; end: number }) => {
    const body = range ? bytes.slice(range.start, range.end + 1) : bytes;
    return new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(body); controller.close(); } });
  });
  return { file: { path: "result.mp4", size: bytes.length, contentType: "video/mp4", createStream } satisfies BinaryFile, createStream };
}

describe("pipelineMediaResponse", () => {
  it("streams a full local file", async () => {
    const preview = file();
    const response = pipelineMediaResponse(new Request("http://localhost/media"), preview.file);
    expect(response.status).toBe(200);
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(response.headers.get("Content-Length")).toBe("5");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it("serves a byte range for seeking", async () => {
    const preview = file();
    const response = pipelineMediaResponse(new Request("http://localhost/media", { headers: { Range: "bytes=1-3" } }), preview.file);
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 1-3/5");
    expect(preview.createStream).toHaveBeenCalledWith({ start: 1, end: 3 });
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("supports a suffix range", async () => {
    const preview = file();
    const response = pipelineMediaResponse(new Request("http://localhost/media", { headers: { Range: "bytes=-2" } }), preview.file);
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 3-4/5");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([3, 4]));
  });

  it("rejects an out-of-bounds range without opening a stream", () => {
    const preview = file();
    const response = pipelineMediaResponse(new Request("http://localhost/media", { headers: { Range: "bytes=9-" } }), preview.file);
    expect(response.status).toBe(416);
    expect(response.headers.get("Content-Range")).toBe("bytes */5");
    expect(preview.createStream).not.toHaveBeenCalled();
  });
});
