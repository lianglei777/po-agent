import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

type Fixture = {
  id: string;
  category: string;
  objective: string;
  expectedSpecialists: string[];
  forbiddenBehaviors: string[];
};

describe("Pipeline Specialist evaluation fixtures", () => {
  it("keeps the frozen 20-case V1 evaluation matrix complete", async () => {
    const file = new URL("../../../../../resources/pipeline-specialists/evaluation/fixtures.zh-CN.json", import.meta.url);
    const fixtures = JSON.parse(await readFile(file, "utf8")) as Fixture[];
    expect(fixtures).toHaveLength(20);
    expect(new Set(fixtures.map((fixture) => fixture.id)).size).toBe(20);
    expect(count(fixtures, "complete-short-video")).toBe(5);
    expect(count(fixtures, "multi-episode-drama")).toBe(3);
    expect(count(fixtures, "script-only")).toBe(3);
    expect(count(fixtures, "asset-dedup-continuity")).toBe(3);
    expect(count(fixtures, "local-storyboard-edit")).toBe(3);
    expect(count(fixtures, "route-reference")).toBe(3);
    for (const fixture of fixtures) {
      expect(fixture.objective.trim()).not.toBe("");
      expect(fixture.expectedSpecialists.length).toBeGreaterThan(0);
      expect(fixture.forbiddenBehaviors.length).toBeGreaterThan(0);
    }
  });
});

function count(fixtures: Fixture[], category: string): number {
  return fixtures.filter((fixture) => fixture.category === category).length;
}
