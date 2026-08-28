import { describe, expect, it, vi } from "vitest";
import { readLimitedResponse } from "./read-limited-response";

describe("readLimitedResponse", () => {
  it("stops a chunked response as soon as the actual byte limit is exceeded", async () => {
    const cancel = vi.fn(async () => undefined);
    const releaseLock = vi.fn();
    const read = vi.fn()
      .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3]) })
      .mockResolvedValueOnce({ done: false, value: new Uint8Array([4, 5, 6]) });
    const response = {
      headers: new Headers(),
      body: { getReader: () => ({ read, cancel, releaseLock }) },
    } as unknown as Response;

    await expect(readLimitedResponse(response, {
      limitBytes: 5,
      tooLargeMessage: "too large",
    })).rejects.toMatchObject({
      code: "GENERATION_DOWNLOAD_TOO_LARGE",
      message: "too large",
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledTimes(2);
    expect(releaseLock).toHaveBeenCalledOnce();
  });

  it("combines chunks that remain within the limit", async () => {
    const response = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3]));
        controller.close();
      },
    }));

    await expect(readLimitedResponse(response, {
      limitBytes: 3,
      tooLargeMessage: "too large",
    })).resolves.toEqual(new Uint8Array([1, 2, 3]));
  });
});
