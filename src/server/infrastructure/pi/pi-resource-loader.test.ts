import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createPiResourceLoader,
  ensureDefaultWebAccessConfig,
} from "./pi-resource-loader";

async function createWebAccessExtension(root: string): Promise<string> {
  const extensionDir = path.join(root, "pi-web-access");
  await fs.mkdir(extensionDir, { recursive: true });
  await fs.writeFile(
    path.join(extensionDir, "package.json"),
    JSON.stringify({
      name: "pi-web-access-test",
      pi: { extensions: ["./index.ts"] },
    }),
  );
  await fs.writeFile(
    path.join(extensionDir, "index.ts"),
    `export default function extension(pi) {
      for (const name of ["web_search", "fetch_content", "get_search_content", "source_check"]) {
        pi.registerTool({
          name,
          label: name,
          description: name,
          parameters: { type: "object", properties: {} },
          async execute() { return { content: [{ type: "text", text: "ok" }] }; },
        });
      }
    }`,
  );
  return extensionDir;
}

describe("createPiResourceLoader", () => {
  it("loads the installed pi-web-access extension and its required tools", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "po-web-installed-"));
    const cwd = path.join(root, "workspace");
    const agentDir = path.join(root, "agent");
    const builtinSkillsDir = path.join(root, "builtins");
    const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = agentDir;
    await fs.mkdir(cwd, { recursive: true });
    await fs.mkdir(builtinSkillsDir, { recursive: true });

    try {
      const loader = await createPiResourceLoader({
        cwd,
        agentDir,
        builtinSkillsDir,
      });
      const webAccess = loader.getExtensions().extensions.find((extension) =>
        extension.resolvedPath.includes("pi-web-access"),
      );

      expect([...webAccess!.tools.keys()]).toEqual(expect.arrayContaining([
        "web_search",
        "fetch_content",
        "get_search_content",
        "source_check",
      ]));
      expect(
        webAccess!.tools.get("web_search")!.definition.promptGuidelines,
      ).toContainEqual(expect.stringContaining("untrusted data"));
      const fetchContent = webAccess!.tools.get("fetch_content")!.definition;
      await expect(fetchContent.execute(
        "call-local",
        { url: "C:\\private\\notes.txt" },
        undefined,
        undefined,
        {} as never,
      )).rejects.toThrow(/only accepts HTTP or HTTPS URLs/);
    } finally {
      if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
      await fs.rm(root, { force: true, recursive: true });
    }
  });

  it("reloads changed and newly created append prompt files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "po-prompts-"));
    const cwd = path.join(root, "workspace");
    const agentDir = path.join(root, "agent");
    const builtinSkillsDir = path.join(root, "builtins");
    await fs.mkdir(cwd, { recursive: true });
    await fs.mkdir(agentDir, { recursive: true });
    await fs.mkdir(builtinSkillsDir, { recursive: true });
    await fs.writeFile(path.join(agentDir, "APPEND_SYSTEM.md"), "global v1");
    const webAccessDir = await createWebAccessExtension(root);

    try {
      const loader = await createPiResourceLoader({
        cwd,
        agentDir,
        builtinSkillsDir,
        webAccessDir,
      });
      expect(loader.getAppendSystemPrompt()).toEqual(["global v1"]);

      await fs.writeFile(path.join(agentDir, "APPEND_SYSTEM.md"), "global v2");
      await fs.mkdir(path.join(cwd, ".pi"), { recursive: true });
      await fs.writeFile(path.join(cwd, ".pi", "APPEND_SYSTEM.md"), "project v1");
      await loader.reload();

      expect(loader.getAppendSystemPrompt()).toEqual(["global v2", "project v1"]);
    } finally {
      await fs.rm(root, { force: true, recursive: true });
    }
  });

  it("loads built-in skills with dedicated source metadata", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "po-builtins-"));
    const cwd = path.join(root, "workspace");
    const agentDir = path.join(root, "agent");
    const builtinSkillsDir = path.join(root, "builtins");
    await fs.mkdir(path.join(builtinSkillsDir, "review-changes"), {
      recursive: true,
    });
    await fs.mkdir(cwd, { recursive: true });
    await fs.writeFile(
      path.join(builtinSkillsDir, "review-changes", "SKILL.md"),
      "---\nname: review-changes\ndescription: Review changes\n---\n",
    );
    const webAccessDir = await createWebAccessExtension(root);

    try {
      const loader = await createPiResourceLoader({
        cwd,
        agentDir,
        builtinSkillsDir,
        webAccessDir,
      });

      expect(loader.getSkills().skills).toEqual([
        expect.objectContaining({
          name: "review-changes",
          sourceInfo: expect.objectContaining({ source: "po-agent-builtin" }),
        }),
      ]);
    } finally {
      await fs.rm(root, { force: true, recursive: true });
    }
  });

  it("preserves Package metadata when built-in skills are extended", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "po-packages-"));
    const cwd = path.join(root, "workspace");
    const agentDir = path.join(root, "agent");
    const builtinSkillsDir = path.join(root, "builtins");
    const packageDir = path.join(root, "developer-workflows");
    const settingsDir = path.join(cwd, ".pi");
    const skillDir = path.join(packageDir, "skills", "prepare-change");
    await fs.mkdir(path.join(builtinSkillsDir, "review-changes"), {
      recursive: true,
    });
    await fs.mkdir(skillDir, { recursive: true });
    await fs.mkdir(settingsDir, { recursive: true });
    await fs.writeFile(
      path.join(builtinSkillsDir, "review-changes", "SKILL.md"),
      "---\nname: review-changes\ndescription: Review changes\n---\n",
    );
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      "---\nname: prepare-change\ndescription: Prepare change\n---\n",
    );
    await fs.writeFile(
      path.join(packageDir, "package.json"),
      JSON.stringify({ name: "developer-workflows", pi: { skills: ["./skills"] } }),
    );
    const configuredSource = path.relative(settingsDir, packageDir);
    const webAccessDir = await createWebAccessExtension(root);
    await fs.writeFile(
      path.join(settingsDir, "settings.json"),
      JSON.stringify({ packages: [configuredSource] }),
    );

    try {
      const loader = await createPiResourceLoader({
        cwd,
        agentDir,
        builtinSkillsDir,
        webAccessDir,
      });
      const packageSkill = loader
        .getSkills()
        .skills.find((skill) => skill.name === "prepare-change");

      expect(packageSkill?.sourceInfo).toMatchObject({
        source: configuredSource,
        scope: "project",
        origin: "package",
      });
    } finally {
      await fs.rm(root, { force: true, recursive: true });
    }
  });

  it("creates the conservative Web Access config once without overwriting user settings", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "po-web-config-"));
    const agentDir = path.join(root, "agent");

    try {
      await Promise.all([
        ensureDefaultWebAccessConfig(agentDir),
        ensureDefaultWebAccessConfig(agentDir),
      ]);
      const configPath = path.join(agentDir, "web-search.json");
      const defaults = JSON.parse(await fs.readFile(configPath, "utf8"));
      expect(defaults).toMatchObject({
        workflow: "none",
        allowBrowserCookies: false,
        githubClone: { enabled: false },
        youtube: { enabled: false },
        video: { enabled: false },
        image: { enabled: false },
        fetchRouting: { allowRemoteHostedProviders: false },
      });

      await fs.writeFile(configPath, '{"provider":"brave"}\n');
      await ensureDefaultWebAccessConfig(agentDir);
      expect(await fs.readFile(configPath, "utf8")).toBe(
        '{"provider":"brave"}\n',
      );
    } finally {
      await fs.rm(root, { force: true, recursive: true });
    }
  });

  it("fails when the built-in extension does not register every required tool", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "po-web-invalid-"));
    const cwd = path.join(root, "workspace");
    const agentDir = path.join(root, "agent");
    const builtinSkillsDir = path.join(root, "builtins");
    const webAccessDir = path.join(root, "invalid-web-access");
    await fs.mkdir(cwd, { recursive: true });
    await fs.mkdir(builtinSkillsDir, { recursive: true });
    await fs.mkdir(webAccessDir, { recursive: true });
    await fs.writeFile(
      path.join(webAccessDir, "package.json"),
      JSON.stringify({
        name: "invalid-web-access",
        pi: { extensions: ["./index.ts"] },
      }),
    );
    await fs.writeFile(
      path.join(webAccessDir, "index.ts"),
      "export default function extension() {}",
    );

    try {
      await expect(createPiResourceLoader({
        cwd,
        agentDir,
        builtinSkillsDir,
        webAccessDir,
      })).rejects.toThrow(/did not register required tools/);
    } finally {
      await fs.rm(root, { force: true, recursive: true });
    }
  });
});
