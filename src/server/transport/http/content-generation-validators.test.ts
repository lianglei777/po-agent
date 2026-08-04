import { describe, expect, it } from "vitest";
import { parseContentGenerationApi } from "./content-generation-validators";

describe("parseContentGenerationApi", () => {
  it("accepts the minimal polling protocol", () => {
    const parsed = parseContentGenerationApi({
      id: "api-1",
      name: "Video API",
      providerName: "Provider",
      capability: "text-to-video",
      requiresImages: false,
      submit: {
        method: "POST",
        url: "https://provider.example/generate",
        bodyTemplate: { prompt: "{{input.prompt}}" },
        taskIdPath: "taskId",
      },
      completion: {
        mode: "polling",
        request: {
          method: "POST",
          url: "https://provider.example/query",
          bodyTemplate: { taskId: "{{job.remoteTaskId}}" },
        },
        statusPath: "status",
        pendingValues: ["RUNNING"],
        successValues: ["SUCCESS"],
        failureValues: ["FAILED"],
        intervalMs: 5000,
        timeoutMs: 120000,
      },
      output: {
        collectionPath: "results",
        urlPath: "url",
        defaultMediaType: "video",
        downloadRemoteFiles: true,
      },
    });

    expect(parsed.completion.mode).toBe("polling");
    expect(parsed.submit.url).toBe("https://provider.example/generate");
  });

  it("rejects non-http provider URLs", () => {
    expect(() =>
      parseContentGenerationApi({
        id: "api-1",
        name: "Video API",
        providerName: "Provider",
        capability: "text-to-video",
        requiresImages: false,
        submit: { method: "POST", url: "file:///secret", bodyTemplate: {} },
        completion: { mode: "immediate" },
        output: {
          collectionPath: "results",
          defaultMediaType: "video",
          downloadRemoteFiles: true,
        },
      }),
    ).toThrow("submit.url must use HTTP or HTTPS");
  });
});
