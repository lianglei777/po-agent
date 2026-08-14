import { describe, expect, it } from "vitest";
import {
  parseAgentCommand,
  parseCreateAgent,
  parseUpdateAgentSettings,
  parseUpdateWebAccessSettings,
  parseDeleteProjectInstructions,
  parseDeleteSystemInstructions,
  parseModelsConfig,
  parseProjectPath,
  parseSaveProjectInstructions,
  parseSaveSystemInstructions,
  parseSkillCreateLocal,
  parseSkillInstall,
  parseSkillPackInstall,
  parseSkillPackInstallSource,
  parseSkillPackMaintain,
  parseSkillPackRemove,
  parseSkillRemove,
} from "./validators";

describe("agent HTTP validation", () => {
  it("accepts runtime creation without an initial prompt", () => {
    expect(
      parseCreateAgent({
        cwd: "C:\\work",
        provider: "provider",
        modelId: "model",
      }),
    ).toEqual({
      cwd: "C:\\work",
      provider: "provider",
      modelId: "model",
      thinkingLevel: undefined,
      toolNames: undefined,
    });
  });

  it("accepts image-only steer but rejects an empty command", () => {
    expect(
      parseAgentCommand({
        type: "steer",
        message: "",
        images: [{ type: "image", data: "abc", mimeType: "image/png" }],
      }),
    ).toMatchObject({ type: "steer", message: "" });
    expect(() =>
      parseAgentCommand({ type: "prompt", message: "", images: [] }),
    ).toThrow("message or images must be provided");
  });

  it("parses generation review only for a prompt command", () => {
    expect(
      parseAgentCommand({
        type: "prompt",
        message: "Generate a video",
        generationReview: true,
      }),
    ).toMatchObject({ generationReview: true });
    expect(
      parseAgentCommand({
        type: "steer",
        message: "Continue",
        generationReview: true,
      }),
    ).not.toHaveProperty("generationReview");
  });

  it("validates the per-turn generation policy and uploaded asset references", () => {
    expect(parseAgentCommand({
      type: "prompt",
      message: "Create a new poster",
      generation: {
        mode: { type: "generation-route", routeId: "route-1" },
        reviewFirst: true,
        assets: [{
          slot: "imageUrls",
          name: "reference.png",
          mediaType: "image",
          mimeType: "image/png",
          ref: { type: "workspace-file", relativePath: ".po-agent/generation-inputs/reference.png" },
        }],
      },
    })).toMatchObject({
      generation: {
        mode: { type: "generation-route", routeId: "route-1" },
        reviewFirst: true,
        assets: [{ mediaType: "image" }],
      },
    });
    expect(() => parseAgentCommand({
      type: "prompt",
      message: "Create",
      generation: {
        mode: { type: "generation-auto" },
        reviewFirst: false,
        assets: [{
          slot: "imageUrls",
          name: "bad.exe",
          mediaType: "binary",
          mimeType: "application/octet-stream",
          ref: { type: "workspace-file", relativePath: "bad.exe" },
        }],
      },
    })).toThrow("generation asset mediaType is unsupported");
  });

  it("parses the auto-retry command", () => {
    expect(
      parseAgentCommand({ type: "set_auto_retry", enabled: true }),
    ).toEqual({
      type: "set_auto_retry",
      enabled: true,
    });
  });

  it("parses global Agent settings updates", () => {
    expect(parseUpdateAgentSettings({ autoCompactionEnabled: false })).toEqual({
      autoCompactionEnabled: false,
    });
    expect(() =>
      parseUpdateAgentSettings({ autoCompactionEnabled: "false" }),
    ).toThrow("autoCompactionEnabled must be a boolean");
  });

  it("parses Web Access settings and rejects incomplete provider lists", () => {
    const input = {
      mode: "custom",
      providers: [
        { id: "brave", enabled: true, apiKey: "secret" },
        { id: "tavily", enabled: false, apiKey: "" },
        { id: "exa", enabled: true, apiKey: "" },
        { id: "duckduckgo", enabled: true, apiKey: "" },
      ],
      fallbackOn: ["network", "quota"],
    };
    expect(parseUpdateWebAccessSettings(input)).toEqual(input);
    expect(() =>
      parseUpdateWebAccessSettings({
        ...input,
        providers: input.providers.slice(1),
      }),
    ).toThrow(/every supported provider/);
  });

  it("accepts the skills market package contract", () => {
    expect(
      parseSkillInstall({
        package: "owner/repo@demo",
        scope: "project",
        cwd: "C:\\work",
      }),
    ).toEqual({
      packageSpec: "owner/repo@demo",
      scope: "project",
      cwd: "C:\\work",
    });
  });

  it("parses skill remove requests", () => {
    expect(
      parseSkillRemove({
        skillId: "abc123",
        cwd: "C:\\work",
      }),
    ).toEqual({
      skillId: "abc123",
      cwd: "C:\\work",
    });
    expect(() => parseSkillRemove({ skillId: "" })).toThrow(
      "skillId must be a non-empty string",
    );
    expect(() => parseSkillRemove({ skillId: "abc" })).toThrow(
      "cwd must be a non-empty string",
    );
  });

  it("parses Skill Pack mutations with opaque IDs", () => {
    expect(
      parseSkillPackInstall({
        packId: "pack_abc",
        scope: "project",
        cwd: "C:\\work",
      }),
    ).toEqual({
      packId: "pack_abc",
      scope: "project",
      cwd: "C:\\work",
    });
    expect(
      parseSkillPackRemove({ packId: "pack_abc", cwd: "C:\\work" }),
    ).toEqual({ packId: "pack_abc", cwd: "C:\\work" });
    expect(() =>
      parseSkillPackInstall({
        packId: "pack_abc",
        scope: "bad",
        cwd: "C:\\work",
      }),
    ).toThrow("scope must be global or project");
    expect(() => parseSkillPackRemove({ packId: "pack_abc", cwd: "" })).toThrow(
      "cwd must be a non-empty string",
    );
  });

  it("parses Skill Pack source installs and maintenance", () => {
    expect(
      parseSkillPackInstallSource({
        source: "D:\\skill-packs\\release",
        scope: "project",
        cwd: "C:\\work",
      }),
    ).toEqual({
      source: "D:\\skill-packs\\release",
      scope: "project",
      cwd: "C:\\work",
    });
    expect(
      parseSkillPackMaintain({ packId: "pack_abc", cwd: "C:\\work" }),
    ).toEqual({ packId: "pack_abc", cwd: "C:\\work" });
    expect(() =>
      parseSkillPackInstallSource({
        source: "",
        scope: "global",
        cwd: "C:\\work",
      }),
    ).toThrow("source must be a non-empty string");
    expect(() =>
      parseSkillPackInstallSource({
        source: "@scope/release-pack",
        scope: "bad",
        cwd: "C:\\work",
      }),
    ).toThrow("scope must be global or project");
    expect(() =>
      parseSkillPackMaintain({ packId: "", cwd: "C:\\work" }),
    ).toThrow("packId must be a non-empty string");
  });

  it("parses local skill import requests", () => {
    expect(
      parseSkillCreateLocal({
        sourceFilePath: "D:\\my-skills\\review\\SKILL.md",
        scope: "project",
        cwd: "C:\\work",
      }),
    ).toEqual({
      sourceFilePath: "D:\\my-skills\\review\\SKILL.md",
      scope: "project",
      cwd: "C:\\work",
    });
    expect(
      parseSkillCreateLocal({
        sourceFilePath: "D:\\my-skills\\review\\SKILL.md",
        scope: "global",
      }),
    ).toEqual({
      sourceFilePath: "D:\\my-skills\\review\\SKILL.md",
      scope: "global",
      cwd: undefined,
    });
    expect(() =>
      parseSkillCreateLocal({ sourceFilePath: "", scope: "project" }),
    ).toThrow("sourceFilePath must be a non-empty string");
    expect(() =>
      parseSkillCreateLocal({ sourceFilePath: "x", scope: "bad" }),
    ).toThrow("scope must be global or project");
  });

  it("sanitizes protocol-specific model compatibility fields", () => {
    expect(
      parseModelsConfig({
        providers: {
          custom: {
            api: "openai-responses",
            compat: {
              sendSessionIdHeader: false,
              supportsDeveloperRole: false,
            },
          },
        },
      }),
    ).toEqual({
      providers: {
        custom: {
          api: "openai-responses",
          compat: { sendSessionIdHeader: false },
        },
      },
    });
  });

  it("rejects unsupported model API protocols", () => {
    expect(() =>
      parseModelsConfig({
        providers: { custom: { api: "future-api" } },
      }),
    ).toThrow("Unsupported API protocol: future-api");
  });

  it("validates project path bodies", () => {
    expect(parseProjectPath({ path: " /work/app " })).toEqual({
      path: "/work/app",
    });
    expect(() => parseProjectPath({ path: "" })).toThrow(
      "path must be a non-empty string",
    );
  });

  it("parses reload_instructions command", () => {
    expect(parseAgentCommand({ type: "reload_instructions" })).toEqual({
      type: "reload_instructions",
    });
  });

  it("parses save system instructions requests", () => {
    expect(
      parseSaveSystemInstructions({
        content: "test content",
        expectedRevision: "sha256:abc",
      }),
    ).toEqual({
      content: "test content",
      expectedRevision: "sha256:abc",
      force: undefined,
    });
    expect(
      parseSaveSystemInstructions({
        content: "",
        expectedRevision: "sha256:absent",
        force: true,
      }),
    ).toEqual({
      content: "",
      expectedRevision: "sha256:absent",
      force: true,
    });
    expect(() =>
      parseSaveSystemInstructions({ content: 123, expectedRevision: "r" }),
    ).toThrow("content must be a string");
    expect(() => parseSaveSystemInstructions({ content: "x" })).toThrow(
      "expectedRevision must be a non-empty string",
    );
  });

  it("parses delete system instructions requests", () => {
    expect(
      parseDeleteSystemInstructions({
        expectedRevision: "sha256:abc",
      }),
    ).toEqual({
      expectedRevision: "sha256:abc",
      force: undefined,
    });
    expect(() =>
      parseDeleteSystemInstructions({ expectedRevision: 123 }),
    ).toThrow("expectedRevision must be a non-empty string");
  });

  it("parses save project instructions requests", () => {
    expect(
      parseSaveProjectInstructions({
        cwd: "C:\\work",
        content: "test",
        expectedRevision: "sha256:abc",
      }),
    ).toEqual({
      cwd: "C:\\work",
      content: "test",
      expectedRevision: "sha256:abc",
      force: undefined,
    });
    expect(() =>
      parseSaveProjectInstructions({
        cwd: "",
        content: "x",
        expectedRevision: "r",
      }),
    ).toThrow("cwd must be a non-empty string");
  });

  it("parses delete project instructions requests", () => {
    expect(
      parseDeleteProjectInstructions({
        cwd: "C:\\work",
        expectedRevision: "sha256:abc",
      }),
    ).toEqual({
      cwd: "C:\\work",
      expectedRevision: "sha256:abc",
      force: undefined,
    });
    expect(() => parseDeleteProjectInstructions({ cwd: "C:\\work" })).toThrow(
      "expectedRevision must be a non-empty string",
    );
  });
});
