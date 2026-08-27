import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadGenerationProviders,
  loadGenerationRoutes,
  saveGenerationProviderCredential,
  updateGenerationProviderSettings,
} from "./api";

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

  it("uses encoded provider IDs with the generic settings endpoints", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      providerId: "provider/name",
      enabled: true,
    }));
    vi.stubGlobal("fetch", fetchMock);

    await updateGenerationProviderSettings("provider/name", true);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/generation/providers/provider%2Fname",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("loads provider descriptors and saves credentials without vendor-specific clients", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json({ hasCredential: true }));
    vi.stubGlobal("fetch", fetchMock);

    await loadGenerationProviders();
    await saveGenerationProviderCredential("qianwen", "secret");

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/generation/providers",
      "/api/generation/credentials/qianwen",
    ]);
  });
});
