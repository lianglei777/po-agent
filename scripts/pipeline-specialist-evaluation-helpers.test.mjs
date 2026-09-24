import test from "node:test";
import assert from "node:assert/strict";
import {
  changedProtectedNodeIds,
  evaluationArtifactNames,
  scoreSpecialistEvidence,
} from "./pipeline-specialist-evaluation-helpers.mjs";

test("focused evaluations use separate artifacts", () => {
  assert.deepEqual(evaluationArtifactNames(true), {
    summary: "partial-summary.json",
    scorecard: "partial-scorecard.csv",
  });
  assert.deepEqual(evaluationArtifactNames(false), {
    summary: "summary.json",
    scorecard: "scorecard.csv",
  });
});

test("protected baseline nodes are compared by persisted data", () => {
  const baseline = [
    { id: "source", data: { content: ["keep"], name: "Source" } },
    { id: "target", data: { content: ["old"] } },
  ];
  const final = [
    { id: "source", data: { name: "Source", content: ["changed"] } },
    { id: "target", data: { content: ["new"] } },
  ];
  assert.deepEqual(changedProtectedNodeIds(baseline, final, ["target"]), ["source"]);
});

test("a specialist draft only passes when its exact plan is applied", () => {
  const fixture = {
    category: "script-only",
    expectedSpecialists: ["script"],
    expectedNodeMinimums: { script: 1 },
  };
  const evidence = {
    specialistCalls: ["script"],
    specialistResults: [{
      kind: "script", profileVersion: "1.0.0", executionMode: "repaired",
      status: "draft", operationCount: 1, planId: "plan-1",
    }],
    appliedPlanIds: ["another-plan"],
    toolErrors: [], nodeCounts: { script: 1 }, duplicateIdentityKeys: [],
    preflightSucceeded: false, changedProtectedNodeIds: [], generationRunIds: [],
  };
  const metrics = scoreSpecialistEvidence(evidence, fixture);
  assert.equal(metrics.structureValid, true);
  assert.equal(metrics.repairUsed, true);
  assert.equal(metrics.planValid, false);
});
