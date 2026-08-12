import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DefaultResourceLoader } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import type { SkillInfo } from "@/server/domain/skill";
import type { ProcessRunner } from "@/server/ports/process-runner";
import {
  buildInstallArgs,
  buildRemoveArgs,
  displaySkillPath,
  parseCliSearch,
  PiSkillProvider,
  updateSkillFrontmatter,
  validatePackageSpec,
  validateSkillName,
} from "./pi-skill-provider";
import { resolveBuiltinWebAccessDir } from "./pi-resource-loader";

const skillFixture: SkillInfo = {
  skillId: "packed-id",
  name: "packed",
  description: "Packed",
  filePath: "C:\\work\\packed\\SKILL.md",
  displayPath: ".pi\\skills\\packed\\SKILL.md",
  baseDir: "C:\\work\\packed",
  sourceInfo: {
    path: "C:\\work\\packed\\SKILL.md",
    source: "auto",
    scope: "project",
    origin: "top-level",
  },
  canModify: true,
  disableModelInvocation: false,
  version: "v1",
};

describe("PiSkillProvider helpers", () => {
  it("maps package-owned skills as immutable", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pack-skill-"));
    const filePath = path.join(root, "SKILL.md");
    await fs.writeFile(
      filePath,
      "---\nname: packed\ndescription: Packed\n---\n",
    );

    const reload = vi
      .spyOn(DefaultResourceLoader.prototype, "reload")
      .mockResolvedValue();
    const getSkills = vi
      .spyOn(DefaultResourceLoader.prototype, "getSkills")
      .mockReturnValue({
        diagnostics: [],
        skills: [{
          name: "packed",
          description: "Packed",
          filePath,
          baseDir: root,
          disableModelInvocation: false,
          sourceInfo: {
            path: filePath,
            source:
              "https://user:secret@example.com/developer-workflows.git?token=hidden",
            scope: "project",
            origin: "package",
          },
        }],
      });
    const getExtensions = vi
      .spyOn(DefaultResourceLoader.prototype, "getExtensions")
      .mockReturnValue({
        extensions: [{
          resolvedPath: path.join(
            resolveBuiltinWebAccessDir(),
            "index.ts",
          ),
          tools: new Map(
            ["web_search", "fetch_content", "get_search_content", "source_check"]
              .map((name) => [name, {
                definition: {
                  name,
                  promptGuidelines: [],
                  execute: vi.fn(),
                },
              }]),
          ),
        }] as never,
        errors: [],
        runtime: {} as never,
      });

    try {
      const provider = new PiSkillProvider({ run: vi.fn() } as ProcessRunner);
      const result = await provider.load(root);
      expect(result).toMatchObject({
        skills: [expect.objectContaining({
          canModify: false,
          sourceInfo: expect.objectContaining({
            source: "https://example.com/developer-workflows.git",
          }),
        })],
      });
      expect(JSON.stringify(result)).not.toMatch(/secret|hidden/);
    } finally {
      reload.mockRestore();
      getSkills.mockRestore();
      getExtensions.mockRestore();
    }
  });

  it("rejects standalone removal for a package-owned skill", async () => {
    const provider = new PiSkillProvider({ run: vi.fn() } as ProcessRunner);
    vi.spyOn(provider, "load").mockResolvedValue({
      diagnostics: [],
      skills: [
        {
          ...skillFixture,
          canModify: false,
          sourceInfo: {
            ...skillFixture.sourceInfo,
            origin: "package",
          },
        },
      ],
    });

    await expect(
      provider.remove({ cwd: "C:\\work", skillId: skillFixture.skillId }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 403 });
  });

  it("preserves BOM, CRLF, comments, and unrelated frontmatter", () => {
    const source =
      "\uFEFF---\r\nname: demo\r\ndisable-model-invocation: false # keep\r\ntags: [one]\r\n---\r\nBody";
    const disabled = updateSkillFrontmatter(source, true);

    expect(disabled).toContain(
      "disable-model-invocation: true # keep\r\n",
    );
    expect(disabled).toContain("tags: [one]");
    expect(disabled.startsWith("\uFEFF---\r\n")).toBe(true);
    expect(updateSkillFrontmatter(disabled, false)).not.toContain(
      "disable-model-invocation",
    );
  });

  it("adds frontmatter without rewriting existing content", () => {
    expect(updateSkillFrontmatter("# Demo\nBody", true)).toBe(
      "---\ndisable-model-invocation: true\n---\n# Demo\nBody",
    );
  });

  it("formats project, home, and absolute paths cross-platform", () => {
    expect(
      displaySkillPath(
        "C:\\work\\repo\\.pi\\skills\\demo\\SKILL.md",
        "C:\\work\\repo",
        "C:\\Users\\me",
      ),
    ).toBe(".pi\\skills\\demo\\SKILL.md");
    expect(
      displaySkillPath(
        "/home/me/.pi/agent/skills/demo/SKILL.md",
        "/work/repo",
        "/home/me",
      ),
    ).toBe("~/.pi/agent/skills/demo/SKILL.md");
  });

  it("strips ANSI and deduplicates CLI search results", () => {
    expect(
      parseCliSearch(
        "\u001b[32mowner/repo@demo\u001b[0m\nowner/repo@demo\nx/y@other",
        10,
      ),
    ).toEqual([
      expect.objectContaining({ packageSpec: "owner/repo@demo" }),
      expect.objectContaining({ packageSpec: "x/y@other" }),
    ]);
  });

  it("builds install commands as argument arrays", () => {
    expect(
      buildInstallArgs("C:\\npm\\npx-cli.js", {
        packageSpec: "owner/repo@demo",
        scope: "global",
      }),
    ).toEqual([
      "C:\\npm\\npx-cli.js",
      "--yes",
      "skills",
      "add",
      "owner/repo@demo",
      "-y",
      "--agent",
      "pi",
      "-g",
    ]);
    expect(() => validatePackageSpec("owner/repo; rm -rf")).toThrow(
      "valid skills package reference",
    );
  });

  it("builds remove commands as argument arrays", () => {
    expect(
      buildRemoveArgs("C:\\npm\\npx-cli.js", "react-testing", "project"),
    ).toEqual([
      "C:\\npm\\npx-cli.js",
      "--yes",
      "skills",
      "remove",
      "react-testing",
      "-y",
      "--agent",
      "pi",
    ]);
    expect(
      buildRemoveArgs("C:\\npm\\npx-cli.js", "react-testing", "global"),
    ).toEqual([
      "C:\\npm\\npx-cli.js",
      "--yes",
      "skills",
      "remove",
      "react-testing",
      "-y",
      "--agent",
      "pi",
      "-g",
    ]);
  });

  it("falls back to the CLI when market search fails", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockRejectedValue(new Error("offline"));
    const run = vi.fn().mockResolvedValue({
      stdout: "owner/repo@demo\n",
      stderr: "",
    });
    try {
      const provider = new PiSkillProvider({ run } as ProcessRunner);
      await expect(provider.search("demo", 10)).resolves.toEqual([
        expect.objectContaining({ packageSpec: "owner/repo@demo" }),
      ]);
      expect(run).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(["skills", "find", "demo"]),
        expect.objectContaining({ timeoutMs: 20_000 }),
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("rejects invalid skill names", () => {
    expect(() => validateSkillName("My Skill!")).toThrow(
      "skill name must be 1-64 chars",
    );
    expect(() => validateSkillName("UPPER")).toThrow(
      "skill name must be 1-64 chars",
    );
    expect(() => validateSkillName("-leading-hyphen")).toThrow(
      "skill name must be 1-64 chars",
    );
    expect(() => validateSkillName("")).toThrow(
      "skill name must be 1-64 chars",
    );
    expect(() => validateSkillName("a".repeat(65))).toThrow(
      "skill name must be 1-64 chars",
    );
    expect(() => validateSkillName("path/../traversal")).toThrow(
      "skill name must be 1-64 chars",
    );
    // 合法名称不应抛出
    expect(() => validateSkillName("my-skill")).not.toThrow();
    expect(() => validateSkillName("skill-123")).not.toThrow();
    expect(() => validateSkillName("a")).not.toThrow();
  });
});

describe("PiSkillProvider importLocal", () => {
  function mockProjectSkill(cwd: string, name: string): SkillInfo {
    const skillDir = path.join(cwd, ".pi", "skills", name);
    const filePath = path.join(skillDir, "SKILL.md");
    return {
      skillId: "id",
      name,
      description: "d",
      filePath,
      displayPath: `.pi/skills/${name}/SKILL.md`,
      baseDir: skillDir,
      sourceInfo: {
        path: filePath,
        source: "auto",
        scope: "project",
        origin: "top-level",
      },
      canModify: true,
      disableModelInvocation: false,
      version: "v1",
    };
  }

  it("copies sibling files and subdirectories when importing a skill directory", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "skill-import-cwd-"));
    const sourceRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "skill-import-src-"),
    );
    const sourceDir = path.join(sourceRoot, "my-skill");
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(
      path.join(sourceDir, "SKILL.md"),
      "---\nname: my-skill\ndescription: d\n---\nbody\n",
    );
    await fs.writeFile(path.join(sourceDir, "check.sh"), "echo hi");
    await fs.mkdir(path.join(sourceDir, "templates"));
    await fs.writeFile(path.join(sourceDir, "templates", "report.md"), "# tpl");

    const provider = new PiSkillProvider({ run: vi.fn() } as ProcessRunner);
    const loadSpy = vi
      .spyOn(provider, "load")
      .mockResolvedValue({
        diagnostics: [],
        skills: [mockProjectSkill(cwd, "my-skill")],
      });

    try {
      const result = await provider.importLocal({
        sourceFilePath: sourceDir,
        scope: "project",
        cwd,
      });
      expect(result.created).toBe(true);

      const skillDir = path.join(cwd, ".pi", "skills", "my-skill");
      expect(await fs.readFile(path.join(skillDir, "SKILL.md"), "utf8")).toContain(
        "name: my-skill",
      );
      // 兄弟文件被复制
      expect(await fs.readFile(path.join(skillDir, "check.sh"), "utf8")).toBe(
        "echo hi",
      );
      // 子目录文件被复制
      expect(
        await fs.readFile(path.join(skillDir, "templates", "report.md"), "utf8"),
      ).toBe("# tpl");
      expect(loadSpy).toHaveBeenCalledWith(cwd);
    } finally {
      loadSpy.mockRestore();
      await fs.rm(cwd, { recursive: true, force: true });
      await fs.rm(sourceRoot, { recursive: true, force: true });
    }
  });

  it("falls back to the source directory name when frontmatter has no name", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "skill-import-cwd-"));
    const sourceRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "skill-import-src-"),
    );
    const sourceDir = path.join(sourceRoot, "dir-named-skill");
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(
      path.join(sourceDir, "SKILL.md"),
      "---\ndescription: d\n---\nbody\n",
    );

    const provider = new PiSkillProvider({ run: vi.fn() } as ProcessRunner);
    const loadSpy = vi
      .spyOn(provider, "load")
      .mockResolvedValue({
        diagnostics: [],
        skills: [mockProjectSkill(cwd, "dir-named-skill")],
      });

    try {
      const result = await provider.importLocal({
        sourceFilePath: sourceDir,
        scope: "project",
        cwd,
      });
      expect(result.skills[0]?.name).toBe("dir-named-skill");
      await fs.access(
        path.join(cwd, ".pi", "skills", "dir-named-skill", "SKILL.md"),
      );
    } finally {
      loadSpy.mockRestore();
      await fs.rm(cwd, { recursive: true, force: true });
      await fs.rm(sourceRoot, { recursive: true, force: true });
    }
  });

  it("skips node_modules and hidden entries when copying a directory", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "skill-import-cwd-"));
    const sourceRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "skill-import-src-"),
    );
    const sourceDir = path.join(sourceRoot, "my-skill");
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(
      path.join(sourceDir, "SKILL.md"),
      "---\nname: my-skill\ndescription: d\n---\nbody\n",
    );
    await fs.mkdir(path.join(sourceDir, "node_modules"), { recursive: true });
    await fs.writeFile(
      path.join(sourceDir, "node_modules", "evil.js"),
      "module.exports = 1",
    );
    await fs.writeFile(path.join(sourceDir, ".secret"), "hidden");

    const provider = new PiSkillProvider({ run: vi.fn() } as ProcessRunner);
    const loadSpy = vi
      .spyOn(provider, "load")
      .mockResolvedValue({
        diagnostics: [],
        skills: [mockProjectSkill(cwd, "my-skill")],
      });

    try {
      await provider.importLocal({
        sourceFilePath: sourceDir,
        scope: "project",
        cwd,
      });
      const skillDir = path.join(cwd, ".pi", "skills", "my-skill");
      await expect(fs.access(path.join(skillDir, "node_modules"))).rejects.toThrow();
      await expect(fs.access(path.join(skillDir, ".secret"))).rejects.toThrow();
      await fs.access(path.join(skillDir, "SKILL.md"));
    } finally {
      loadSpy.mockRestore();
      await fs.rm(cwd, { recursive: true, force: true });
      await fs.rm(sourceRoot, { recursive: true, force: true });
    }
  });
});
