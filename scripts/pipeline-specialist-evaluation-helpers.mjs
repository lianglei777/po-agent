export function evaluationArtifactNames(partial) {
  return partial
    ? { summary: "partial-summary.json", scorecard: "partial-scorecard.csv" }
    : { summary: "summary.json", scorecard: "scorecard.csv" };
}

export function changedProtectedNodeIds(baselineNodes, finalNodes, mutableNodeIds) {
  if (!Array.isArray(baselineNodes)) return null;
  const mutable = new Set(mutableNodeIds ?? []);
  const finalById = new Map(finalNodes.map((node) => [node.id, node]));
  return baselineNodes
    .filter((node) => !mutable.has(node.id))
    .filter((node) => {
      const finalNode = finalById.get(node.id);
      return !finalNode || stableJson(finalNode.data) !== stableJson(node.data);
    })
    .map((node) => node.id);
}

export function scoreSpecialistEvidence(evidence, fixture) {
  const actual = compress(evidence.specialistCalls);
  const expected = fixture.expectedSpecialists;
  const routeCorrect = expected.every((kind, index) => actual.indexOf(kind) >= 0
    && (index === 0 || actual.indexOf(expected[index - 1]) < actual.indexOf(kind)))
    && actual.every((kind) => expected.includes(kind));
  const validResults = evidence.specialistResults.filter((result) => (
    expected.includes(result.kind)
    && typeof result.profileVersion === "string"
    && ["model", "repaired", "fallback"].includes(result.executionMode)
    && ["draft", "no-change"].includes(result.status)
    && Number.isInteger(result.operationCount)
    && (result.status === "no-change" || (typeof result.planId === "string" && result.operationCount > 0))
  ));
  const minimums = fixture.expectedNodeMinimums ?? {};
  const nodeMinimumsMet = Object.entries(minimums).every(([kind, minimum]) => (
    Number(evidence.nodeCounts[kind] ?? 0) >= Number(minimum)
  ));
  const structureValid = evidence.toolErrors.length === 0
    && expected.every((kind) => validResults.some((result) => result.kind === kind))
    && nodeMinimumsMet;
  const draftPlanIds = validResults
    .filter((result) => result.status === "draft")
    .map((result) => result.planId);
  const appliedPlanIds = new Set(evidence.appliedPlanIds);
  const planValid = evidence.toolErrors.length === 0
    && (expected.length === 0 || draftPlanIds.length > 0)
    && draftPlanIds.every((planId) => appliedPlanIds.has(planId));
  const preflightRequired = fixture.category === "complete-short-video" || fixture.category === "multi-episode-drama";
  return {
    routeCorrect,
    structureValid,
    repairUsed: validResults.some((result) => result.executionMode === "repaired"),
    fallbackUsed: validResults.some((result) => result.executionMode === "fallback"),
    planValid,
    duplicateAssets: evidence.duplicateIdentityKeys.length,
    preflightPassed: preflightRequired ? evidence.preflightSucceeded : null,
    outOfScopeMutations: evidence.changedProtectedNodeIds?.length ?? null,
    generationRunsCreated: evidence.generationRunIds.length,
  };
}

function compress(values) {
  return values.filter((value, index) => index === 0 || value !== values[index - 1]);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
