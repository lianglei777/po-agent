import { describe, expect, it } from "vitest";
import type { SkillPackInfo } from "./types";
import { reconcileSelectedSkillPack } from "./skill-state";

const hookSource = readFileSync(
  fileURLToPath(new URL("./use-skill-packs.ts", import.meta.url)),
  "utf8",
);

const PACKS: SkillPackInfo[] = [
  {
    packId: "pack_a",
    name: "A",
    description: "",
    source: "a",
    scope: null,
    status: "available",
    updateAvailable: false,
    canUpdate: false,
    resources: { skills: [], extensions: [], prompts: [], themes: [] },
    containsExtensions: false,
  },
  {
    packId: "pack_b",
    name: "B",
    description: "",
    source: "b",
    scope: "project",
    status: "installed",
    updateAvailable: false,
    canUpdate: true,
    resources: { skills: ["b"], extensions: [], prompts: [], themes: [] },
    containsExtensions: false,
  },
];

describe("Skill Pack selection", () => {
  it("preserves an existing selection after refresh", () => {
    expect(reconcileSelectedSkillPack(PACKS, "pack_b")).toBe("pack_b");
  });

  it("falls back to the first Pack", () => {
    expect(reconcileSelectedSkillPack(PACKS, "missing")).toBe("pack_a");
    expect(reconcileSelectedSkillPack([], "pack_a")).toBeNull();
  });

  it("uses one shared mutation runner for every package operation", () => {
    expect(hookSource).toContain('import type { PackMutation } from "./state/skills-store"');
    expect(hookSource).toContain("const runMutation");
    for (const operation of [
      '"install"',
      '"install-source"',
      '"remove"',
      '"update"',
      '"repair"',
    ]) {
      expect(hookSource).toContain(operation);
    }
    expect(hookSource).not.toContain("installingPackId");
    expect(hookSource).not.toContain("removingPackId");
  });
});
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
