import { describe, expect, it } from "vitest";
import { parseContentGenerationApi, parseContentGenerationProvider } from "./content-generation-validators";

describe("parseContentGenerationApi", () => {
  it("accepts the minimal polling protocol", () => {
    const parsed = parseContentGenerationApi({
      id: "api-1",
      providerId: "provider-1",
      name: "Video API",
      capability: "text-to-video",
      credentialMode: "inherit",
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
        providerId: "provider-1",
        name: "Video API",
        capability: "text-to-video",
        credentialMode: "inherit",
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

  it("parses dynamic fields and named asset slots", () => {
    const parsed = parseContentGenerationApi({
      id: "seedance-image",
      providerId: "runninghub",
      name: "Seedance image to video",
      capability: "image-to-video",
      credentialMode: "inherit",
      catalogId: "runninghub-seedance-2-image-to-video",
      requiresImages: true,
      inputSchema: {
        prompt: { required: false, maxLength: 20480 },
        parameters: [{
          key: "resolution",
          label: "Resolution",
          type: "select",
          options: [{ label: "720p", value: "720p" }],
          defaultValue: "720p",
        }],
        assets: [{
          key: "firstFrameUrl",
          label: "First frame",
          mediaType: "image",
          required: true,
          maxFiles: 1,
        }],
      },
      submit: { method: "POST", url: "https://provider.example/generate" },
      completion: { mode: "immediate" },
      output: {
        collectionPath: "results",
        defaultMediaType: "video",
        downloadRemoteFiles: true,
      },
    });

    expect(parsed).toMatchObject({
      catalogId: "runninghub-seedance-2-image-to-video",
      inputSchema: {
        prompt: { required: false, maxLength: 20480 },
        assets: [{ key: "firstFrameUrl", mediaType: "image", required: true }],
      },
    });
  });

  it("parses a provider with shared credentials", () => {
    expect(parseContentGenerationProvider({
      id: "runninghub",
      name: "RunningHub",
      type: "runninghub",
      apiKey: "secret",
      commonHeaders: { Authorization: "Bearer {{secret.apiKey}}" },
    })).toMatchObject({ id: "runninghub", type: "runninghub" });
  });
});
