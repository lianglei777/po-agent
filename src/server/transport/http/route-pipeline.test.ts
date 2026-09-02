import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/domain/app-error";
import { executeRoute } from "./route-pipeline";

describe("executeRoute", () => {
  it("authorizes before running work and finalizes JSON responses", async () => {
    const authorize = vi.fn();
    const work = vi.fn(async () => ({ id: "item-1" }));

    const response = await executeRoute(work, {
      authorize,
      requestId: "request-1",
    });

    expect(authorize).toHaveBeenCalledBefore(work);
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Request-Id")).toBe("request-1");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toBe("Cookie");
    await expect(response.json()).resolves.toEqual({ id: "item-1" });
  });

  it("does not run work when authorization fails", async () => {
    const work = vi.fn();
    const response = await executeRoute(work, {
      authorize: () => {
        throw new AppError("AUTH_REQUIRED", "Authentication is required", 401);
      },
      requestId: "request-2",
    });

    expect(work).not.toHaveBeenCalled();
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "AUTH_REQUIRED" },
    });
  });

  it("preserves explicit stream and cache headers while adding common headers", async () => {
    const response = await executeRoute(() => new Response("event", {
      headers: {
        "Cache-Control": "no-cache, no-transform",
        "Content-Type": "text/event-stream; charset=utf-8",
        Vary: "Accept-Encoding",
        "X-Accel-Buffering": "no",
      },
    }), { requestId: "request-3" });

    expect(response.headers.get("Cache-Control")).toBe("no-cache, no-transform");
    expect(response.headers.get("Content-Type")).toBe("text/event-stream; charset=utf-8");
    expect(response.headers.get("X-Accel-Buffering")).toBe("no");
    expect(response.headers.get("Vary")).toBe("Accept-Encoding, Cookie");
    await expect(response.text()).resolves.toBe("event");
  });

  it("keeps explicit response status and redacts unknown errors", async () => {
    const empty = await executeRoute(
      () => new Response(null, { status: 204 }),
      { requestId: "request-4" },
    );
    expect(empty.status).toBe(204);

    const failure = await executeRoute(() => {
      throw new Error("C:\\private\\credentials.json");
    }, { requestId: "request-5" });
    expect(failure.status).toBe(500);
    await expect(failure.json()).resolves.toEqual({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
      },
    });
  });

  it("adds retry information for rate-limit errors", async () => {
    const response = await executeRoute(() => {
      throw new AppError("AUTH_RATE_LIMITED", "Try again", 429, {
        retryAfterSeconds: 12.2,
      });
    });

    expect(response.headers.get("Retry-After")).toBe("13");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
