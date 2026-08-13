import { afterEach, describe, expect, it, vi } from "vitest";
import { loadGenerationRoutes } from "./api";

describe("content generation API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports an HTTP status when Next.js returns a non-JSON error page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html>Not Found</html>", {
          status: 404,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }),
      ),
    );

    await expect(loadGenerationRoutes()).rejects.toThrow(
      "Request failed (404)",
    );
  });

  it("preserves an application error message from a JSON response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            success: false,
            error: {
              code: "GENERATION_PROVIDER_DISABLED",
              message: "RunningHub content generation is not enabled",
            },
          },
          { status: 403 },
        ),
      ),
    );

    await expect(loadGenerationRoutes()).rejects.toThrow(
      "RunningHub content generation is not enabled",
    );
  });
});
