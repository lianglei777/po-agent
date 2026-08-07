import { describe, expect, it } from "vitest";
import { createSkillsStore } from "./skills-store";
import type { SkillInfo, SkillPackInfo } from "../types";

const skill = (skillId: string): SkillInfo => ({
  skillId,
  name: skillId,
  description: "",
  filePath: `/${skillId}/SKILL.md`,
  displayPath: "SKILL.md",
  baseDir: `/${skillId}`,
  sourceInfo: {
    path: `/${skillId}`,
    source: "project",
    scope: "project",
    origin: "top-level",
  },
  canModify: true,
  disableModelInvocation: false,
  version: "v1",
});

const pack = (packId: string): SkillPackInfo => ({
  packId,
  name: packId,
  description: "",
  source: packId,
  scope: "project",
  status: "installed",
  updateAvailable: false,
  canUpdate: false,
  resources: { skills: [], extensions: [], prompts: [], themes: [] },
  containsExtensions: false,
});

describe("Skills store", () => {
  it("atomically reconciles selected resources after refresh", () => {
    const store = createSkillsStore({
      selectedSkillId: "missing",
      selectedPackId: "missing",
    });

    store.getState().applySkillsResult({
      skills: [skill("skill-a")],
      diagnostics: [],
    });
    store.getState().applyPacksResult({ packs: [pack("pack-a")] });

    expect(store.getState().selectedSkillId).toBe("skill-a");
    expect(store.getState().selectedPackId).toBe("pack-a");
  });

  it("keeps skill and pack request state independent", () => {
    const store = createSkillsStore();
    store.getState().setSkillsLoading(false);
    store.getState().setPackMutation({ operation: "update", packId: "p1" });

    expect(store.getState().skillsLoading).toBe(false);
    expect(store.getState().packsLoading).toBe(true);
    expect(store.getState().packMutation?.operation).toBe("update");
  });

  it("resets the detail screen when switching views", () => {
    const store = createSkillsStore({ screen: "skill-detail" });
    store.getState().selectView("packs");
    expect(store.getState()).toMatchObject({ view: "packs", screen: "list" });
  });

  it("isolates page instances", () => {
    const first = createSkillsStore();
    const second = createSkillsStore();
    first.getState().setSelectedSkillId("skill-a");
    expect(second.getState().selectedSkillId).toBeNull();
  });
});
