import test from "node:test";
import assert from "node:assert/strict";
import {
  changedProtectedNodeIds,
  evaluationWaitExpiry,
  evaluationArtifactNames,
  evaluationSessionIsStreaming,
  isExpectedBatchSplitError,
  scoreSpecialistEvidence,
  sessionProgressMarker,
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

test("session progress marker changes when persisted output advances", () => {
  const session = {
    info: { modified: "2026-09-25T00:00:00.000Z" },
    context: { messages: [{ role: "assistant", timestamp: 1, content: [{ type: "text", text: "a" }] }] },
  };
  const initial = sessionProgressMarker(session);
  session.context.messages[0].content[0].text = "advanced output";
  assert.notEqual(sessionProgressMarker(session), initial);
});

test("evaluation wait distinguishes inactivity from the hard deadline", () => {
  assert.equal(evaluationWaitExpiry({
    startedAt: 0, lastProgressAt: 8_000, now: 12_000, idleTimeoutMs: 5_000, hardTimeoutMs: 20_000,
  }), null);
  assert.equal(evaluationWaitExpiry({
    startedAt: 0, lastProgressAt: 1_000, now: 7_000, idleTimeoutMs: 5_000, hardTimeoutMs: 20_000,
  }), "idle");
  assert.equal(evaluationWaitExpiry({
    startedAt: 0, lastProgressAt: 18_000, now: 20_000, idleTimeoutMs: 5_000, hardTimeoutMs: 20_000,
  }), "hard");
});

test("expected bounded batching signals are not treated as delivery failures", () => {
  assert.equal(isExpectedBatchSplitError(
    "The Specialist input is too large; split the request by episode or scene",
  ), true);
  assert.equal(isExpectedBatchSplitError(
    "The Specialist result exceeds the safe plan size; split it by episode or scene",
  ), true);
  assert.equal(isExpectedBatchSplitError(
    "The generation workflow exceeds the 30-node limit",
  ), true);
  assert.equal(isExpectedBatchSplitError("The Specialist runtime failed"), false);
});

test("a loaded runtime is settled when its turn is no longer streaming", () => {
  assert.equal(evaluationSessionIsStreaming({
    agentState: { running: true, state: { isStreaming: false } },
  }), false);
  assert.equal(evaluationSessionIsStreaming({
    agentState: { running: true, state: { isStreaming: true } },
  }), true);
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

test("materialized empty media lists are not counted as protected node edits", () => {
  const baseline = [{ id: "reference", data: { name: "Reference", params: { prompt: "same" } } }];
  const final = [{
    id: "reference",
    data: {
      name: "Reference",
      params: {
        prompt: "same", textList: [], imageList: [], videoList: [], audioList: [], mixedListOrder: [],
      },
    },
  }];
  assert.deepEqual(changedProtectedNodeIds(baseline, final, []), []);
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
