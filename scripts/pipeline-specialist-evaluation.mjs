import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  changedProtectedNodeIds,
  evaluationWaitExpiry,
  evaluationArtifactNames,
  evaluationSessionIsStreaming,
  isExpectedBatchSplitError,
  scoreSpecialistEvidence,
  sessionProgressMarker,
} from "./pipeline-specialist-evaluation-helpers.mjs";

const baseUrl = process.env.PIPELINE_EVAL_BASE_URL ?? "http://localhost:3100";
const concurrency = Math.max(1, Math.min(4, Number(process.env.PIPELINE_EVAL_CONCURRENCY ?? 2)));
const fixturePath = path.resolve("resources/pipeline-specialists/evaluation/fixtures.zh-CN.json");
const runId = process.env.PIPELINE_EVAL_RUN_ID ?? new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
const runRoot = path.resolve(".pipeline-eval", "runs", runId);
const projectRoot = path.join(runRoot, "projects");
const fixtures = JSON.parse(await readFile(fixturePath, "utf8"));
await mkdir(projectRoot, { recursive: true });

const selectedIds = new Set((process.env.PIPELINE_EVAL_FIXTURES ?? "").split(",").map((value) => value.trim()).filter(Boolean));
const recoverySessionId = process.env.PIPELINE_EVAL_RECOVER_SESSION_ID?.trim();
const queue = selectedIds.size ? fixtures.filter((fixture) => selectedIds.has(fixture.id)) : fixtures;
if (!queue.length) throw new Error("No Pipeline Specialist evaluation fixtures selected");

const results = [];
const pending = [];
for (const fixture of queue) {
  const resultPath = path.join(runRoot, `${fixture.id}.json`);
  if (process.env.PIPELINE_EVAL_RESUME === "1" && await exists(resultPath)) {
    const previous = JSON.parse(await readFile(resultPath, "utf8"));
    if (previous.status === "passed") {
      results.push(previous);
      process.stdout.write(`${fixture.id}: reused passed result\n`);
      continue;
    }
  }
  pending.push(fixture);
}

// 项目注册表是本地文件存储，创建操作必须串行，避免并发写入造成注册项丢失。
const prepared = [];
for (const fixture of pending) {
  prepared.push(recoverySessionId && pending.length === 1
    ? await recoverFixture(fixture, recoverySessionId)
    : await prepareFixture(fixture));
}

let cursor = 0;
await Promise.all(Array.from({ length: Math.min(concurrency, prepared.length) }, async () => {
  while (cursor < prepared.length) {
    const current = prepared[cursor++];
    const result = await (current.recovered ? evaluateRecoveredFixture(current) : evaluateFixture(current)).catch((error) => ({
      runId, fixtureId: current.fixture.id, category: current.fixture.category,
      projectId: current.project.id, sessionId: current.conversation.sessionId,
      model: [current.conversation.provider, current.conversation.modelId].filter(Boolean).join(":") || "unknown", status: "failed",
      error: error instanceof Error ? error.message : String(error),
      metrics: failedMetrics(),
    }));
    results.push(result);
    await writeFile(path.join(runRoot, `${current.fixture.id}.json`), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    process.stdout.write(`${current.fixture.id}: ${result.status}\n`);
  }
}));

results.sort((left, right) => left.fixtureId.localeCompare(right.fixtureId));
const partial = selectedIds.size > 0;
const artifactNames = evaluationArtifactNames(partial);
const summary = summarize(results, partial ? queue.length : fixtures.length, partial);
await writeFile(path.join(runRoot, artifactNames.summary), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
await writeFile(path.join(runRoot, artifactNames.scorecard), scorecard(results), "utf8");
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (!summary.passed) process.exitCode = 1;

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function prepareFixture(fixture) {
  // 续跑失败样例时保留旧项目作为证据，并为新尝试使用独立目录。
  const rootPath = path.join(projectRoot, `${fixture.id}-${randomUUID()}`);
  const project = await request("/api/pipeline/projects", {
    method: "POST",
    body: { title: `V1 Eval ${fixture.id}`, rootPath, originalText: fixture.input },
  });
  const seed = seedScenario(project.id, fixture);
  let revision = 0;
  if (seed.nodes.length) {
    const snapshot = await request(`/api/pipeline/projects/${project.id}/canvas/mutations`, {
      method: "POST",
      body: {
        baseRevision: 0,
        requestId: `eval-seed-${fixture.id}-${randomUUID()}`,
        mutations: seed.nodes.map((node) => ({ type: "node.create", node })),
      },
    });
    revision = snapshot.revision;
    seed.baselineNodes = snapshot.nodes;
  }
  const conversation = await request(`/api/pipeline/projects/${project.id}/agent-session`);
  return { fixture, project, conversation, seed, revision };
}

async function recoverFixture(fixture, sessionId) {
  const session = await request(`/api/sessions/${sessionId}?includeState=true`);
  if (session.agentState?.state?.isStreaming) throw new Error(`Agent session ${sessionId} is still streaming`);
  const context = session.context?.messages ?? [];
  const trustedContext = context.find((message) => message.customType === "po-agent-generation-context")?.content ?? "";
  const projectId = /"project":\{"id":"([^"]+)"/.exec(trustedContext)?.[1];
  if (!projectId) throw new Error(`Cannot recover project id from Agent session ${sessionId}`);
  return { fixture, project: { id: projectId }, conversation: { sessionId }, session, recovered: true };
}

async function evaluateRecoveredFixture({ fixture, project, conversation, session }) {
  const [snapshot, workflowRuns] = await Promise.all([
    request(`/api/pipeline/projects/${project.id}/canvas`),
    request(`/api/pipeline/projects/${project.id}/canvas/workflow-runs`),
  ]);
  const evidence = extractEvidence(session, snapshot, workflowRuns, fixture);
  const metrics = scoreSpecialistEvidence(evidence, fixture);
  const modelMessage = [...(session.context?.messages ?? [])].reverse().find((message) => message.role === "assistant" && message.model);
  return {
    runId, fixtureId: fixture.id, category: fixture.category, projectId: project.id,
    sessionId: conversation.sessionId,
    model: [modelMessage?.provider, modelMessage?.model].filter(Boolean).join(":") || "unknown",
    intent: { type: "recovered", effectiveStage: "canvas", confidence: "high" },
    status: metricsPassed(metrics) ? "passed" : "failed",
    metrics, evidence,
  };
}

async function evaluateFixture({ fixture, project, conversation, seed, revision }) {
  const prompt = evaluationPrompt(fixture);
  const accepted = await request(`/api/pipeline/projects/${project.id}/agent-session/turns`, {
    method: "POST",
    body: {
      turnId: randomUUID(), message: prompt, canvasRevision: revision,
      referencedNodeIds: seed.focusNodeIds,
    },
  });
  const session = await waitForSession(conversation.sessionId, fixture.id);
  const [snapshot, workflowRuns] = await Promise.all([
    request(`/api/pipeline/projects/${project.id}/canvas`),
    request(`/api/pipeline/projects/${project.id}/canvas/workflow-runs`),
  ]);
  const evidence = extractEvidence(session, snapshot, workflowRuns, fixture, seed);
  const metrics = scoreSpecialistEvidence(evidence, fixture);
  return {
    runId,
    fixtureId: fixture.id,
    category: fixture.category,
    projectId: project.id,
    sessionId: conversation.sessionId,
    model: [conversation.provider, conversation.modelId].filter(Boolean).join(":"),
    intent: {
      type: accepted.intent.type,
      effectiveStage: accepted.intent.effectiveStage,
      confidence: accepted.intent.confidence,
    },
    status: metricsPassed(metrics) ? "passed" : "failed",
    metrics,
    evidence,
  };
}

async function waitForSession(sessionId, fixtureId) {
  const idleTimeoutMs = positiveNumber(process.env.PIPELINE_EVAL_IDLE_TIMEOUT_MS, 360_000);
  const hardTimeoutMs = positiveNumber(
    process.env.PIPELINE_EVAL_HARD_TIMEOUT_MS ?? process.env.PIPELINE_EVAL_TIMEOUT_MS,
    3_600_000,
  );
  const pollIntervalMs = positiveNumber(process.env.PIPELINE_EVAL_POLL_INTERVAL_MS, 5_000);
  const startedAt = Date.now();
  let lastProgressAt = startedAt;
  let progressMarker = null;
  let messageCount = -1;
  while (true) {
    const session = await request(`/api/sessions/${sessionId}?includeState=true`);
    const nextMarker = sessionProgressMarker(session);
    const nextMessageCount = session.context?.messages?.length ?? 0;
    if (nextMarker !== progressMarker) {
      lastProgressAt = Date.now();
      progressMarker = nextMarker;
      if (nextMessageCount !== messageCount) {
        messageCount = nextMessageCount;
        process.stdout.write(`${fixtureId}: ${messageCount} persisted messages\n`);
      }
    }
    if (!evaluationSessionIsStreaming(session)) return session;
    const expiry = evaluationWaitExpiry({
      startedAt, lastProgressAt, now: Date.now(), idleTimeoutMs, hardTimeoutMs,
    });
    if (expiry) {
      const reason = expiry === "idle"
        ? `${idleTimeoutMs} ms without persisted progress`
        : `${hardTimeoutMs} ms hard limit`;
      throw new Error(`Agent session ${sessionId} did not settle (${reason})`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function extractEvidence(session, snapshot, workflowRuns, fixture, seed) {
  const messages = session.context?.messages ?? [];
  const calls = messages.flatMap((message) => blocks(message.content)
    .filter((block) => block?.type === "toolCall")
    .map((block) => ({ name: block.toolName, input: block.input })));
  const results = messages.flatMap((message) => message.role === "toolResult" ? [{
    name: message.toolName,
    text: blocks(message.content).map((block) => block?.text ?? "").join("\n"),
    details: message.details,
    isError: message.isError === true,
  }] : []);
  const specialistCalls = calls.map((call) => specialistKind(call.name)).filter(Boolean);
  const finalText = [...messages].reverse().flatMap((message) => message.role === "assistant"
    ? [blocks(message.content).map((block) => block?.type === "text" ? block.text : "").join("\n")]
    : []).find(Boolean) ?? "";
  const specs = snapshot.nodes.flatMap((node) => node.data?.creativeSpec ? [node.data.creativeSpec] : []);
  const identityKeys = specs.filter((spec) => spec.kind === "asset").map((spec) => spec.identityKey);
  // 会话协议已经提供结构化 isError；不能从创作内容中的“失败”等自然语言推断工具状态。
  const errors = results.filter((result) => result.isError && !isExpectedBatchSplitError(result.text));
  const specialistResults = results.flatMap((result) => {
    const details = result.details;
    return details && typeof details === "object" && specialistKind(result.name) === details.kind
      ? [details]
      : [];
  });
  const generationRunIds = [...new Set([
    ...snapshot.nodes.flatMap((node) => node.data?.taskInfo?.runId ? [node.data.taskInfo.runId] : []),
    ...(workflowRuns.runs ?? []).flatMap((run) => run.id ? [run.id] : []),
  ])];
  return {
    expectedSpecialists: fixture.expectedSpecialists,
    specialistCalls,
    specialistResults,
    toolCalls: calls.map((call) => call.name),
    toolErrors: errors.map((error) => ({ name: error.name, text: error.text.slice(0, 500) })),
    nodeCounts: {
      total: snapshot.nodes.length,
      script: specs.filter((spec) => spec.kind === "script").length,
      asset: specs.filter((spec) => spec.kind === "asset").length,
      shot: specs.filter((spec) => spec.kind === "shot").length,
      media: snapshot.nodes.filter((node) => node.data && node.data.type !== "text").length,
    },
    duplicateIdentityKeys: identityKeys.filter((key, index) => identityKeys.indexOf(key) !== index),
    preflightCalled: calls.some((call) => call.name === "canvas_prepare_generation"),
    preflightSucceeded: results.some((result) => result.name === "canvas_prepare_generation"
      && !result.isError && result.details && typeof result.details === "object"
      && Array.isArray(result.details.nodeIds)),
    appliedPlanIds: results.flatMap((result) => result.name === "canvas_apply_plan"
      && !result.isError && result.details && typeof result.details === "object"
      && typeof result.details.planId === "string" ? [result.details.planId] : []),
    changedProtectedNodeIds: changedProtectedNodeIds(seed?.baselineNodes, snapshot.nodes, seed?.mutableNodeIds),
    generationRunIds,
    finalSummary: finalText.slice(0, 1_500),
  };
}

function summarize(results, expectedFixtureCount, partial) {
  const count = results.length;
  const metric = (name, predicate = Boolean) => results.filter((result) => predicate(result.metrics?.[name])).length / count;
  const automatic = {
    routeAccuracy: metric("routeCorrect"),
    structureValidity: metric("structureValid"),
    planValidity: metric("planValid"),
    duplicateAssetRate: results.reduce((sum, result) => sum + (result.metrics?.duplicateAssets ?? 0), 0) / count,
    preflightPassRate: (() => {
      const relevant = results.filter((result) => result.metrics?.preflightPassed !== null);
      return relevant.length ? relevant.filter((result) => result.metrics.preflightPassed).length / relevant.length : 1;
    })(),
    outOfScopeMutationRate: results.reduce((sum, result) => sum + (result.metrics?.outOfScopeMutations ?? 0), 0) / count,
    unauthorizedGenerationRate: results.reduce((sum, result) => sum + (result.metrics?.generationRunsCreated ?? 0), 0) / count,
    repairRate: metric("repairUsed"),
    fallbackRate: metric("fallbackUsed"),
  };
  const thresholds = {
    routeAccuracy: 0.9, structureValidity: 0.98, planValidity: 0.95,
    duplicateAssetRateMax: 0.05, preflightPassRate: 0.9,
    outOfScopeMutationRateMax: 0, unauthorizedGenerationRateMax: 0, fallbackRateMax: 0.05,
  };
  const passed = count === expectedFixtureCount
    && automatic.routeAccuracy >= thresholds.routeAccuracy
    && automatic.structureValidity >= thresholds.structureValidity
    && automatic.planValidity >= thresholds.planValidity
    && automatic.duplicateAssetRate <= thresholds.duplicateAssetRateMax
    && automatic.preflightPassRate >= thresholds.preflightPassRate
    && automatic.outOfScopeMutationRate <= thresholds.outOfScopeMutationRateMax
    && automatic.unauthorizedGenerationRate <= thresholds.unauthorizedGenerationRateMax
    && automatic.fallbackRate <= thresholds.fallbackRateMax;
  return { runId, scope: partial ? "partial" : "formal", fixtureCount: count, expectedFixtureCount, passed, automatic, thresholds };
}

function scorecard(results) {
  const header = "run_id,fixture_id,profile_versions,model,route_correct,structure_valid,repair_used,fallback_used,plan_valid,duplicate_assets,preflight_passed,out_of_scope_mutations,generation_runs_created,script_score,asset_score,storyboard_score,prompt_score,canvas_score,scope_score,reviewer,notes";
  const rows = results.map((result) => {
    const m = result.metrics;
    return [runId, result.fixtureId, profileVersions(result.evidence?.specialistResults), result.model,
      bool(m.routeCorrect), bool(m.structureValid), bool(m.repairUsed), bool(m.fallbackUsed), bool(m.planValid), m.duplicateAssets,
      m.preflightPassed === null ? "" : bool(m.preflightPassed), m.outOfScopeMutations, m.generationRunsCreated,
      "", "", "", "", "", "", "pending-human-review", result.status].map(csv).join(",");
  });
  return `${header}\n${rows.join("\n")}\n`;
}

function evaluationPrompt(fixture) {
  const completion = fixture.category === "complete-short-video" || fixture.category === "multi-episode-drama"
    ? "完成画布准备后必须执行 canvas_prepare_generation 预检。"
    : "只完成本次要求对应的专业阶段，不要调用无关 Specialist。";
  return [
    `Pipeline Specialist V1 固定评测 ${fixture.id}。`,
    `目标：${fixture.objective}`,
    `输入与现状：${fixture.input}`,
    completion,
    "请实际调用需要的内部 Specialist、应用返回的计划并完成可验证画布交付。不得触发图片、视频或音频生成，不得创建 Generation Run。",
  ].join("\n");
}

function seedScenario(projectId, fixture) {
  const nodes = [];
  const add = (data, creativeSpec) => {
    const id = randomUUID();
    nodes.push(node(projectId, id, data, creativeSpec, nodes.length));
    return id;
  };
  const script = (title = "现有剧本", key = "ep01") => add({ name: title, content: [fixture.input] }, {
    schemaVersion: 1, kind: "script", level: "episode", key, title,
    objective: fixture.input, estimatedDurationSeconds: 60, characters: ["主角"], sourceNodeIds: [],
  });
  const asset = (name, identityKey, facts = [], visualDescription = fixture.input) => add({ name, content: [visualDescription] }, {
    schemaVersion: 1, kind: "asset", assetType: "character", identityKey,
    canonicalName: name, aliases: [], visualDescription, continuityFacts: facts, sourceNodeIds: [],
  });
  const shot = (order, purpose = fixture.input, episodeKey = "ep01") => add({ name: `镜头 ${order + 1}`, content: [purpose] }, {
    schemaVersion: 1, kind: "shot", shotKey: `${episodeKey}-s${String(order + 1).padStart(2, "0")}`,
    episodeKey, order, durationSeconds: 5, purpose, visual: purpose,
    subjects: [{ identityKey: "character:lead", action: "完成场景动作" }],
    dialogue: { speaker: "主角", line: "这是一段需要调整的对白。" },
    shotSize: "中景", cameraMovement: "固定", blocking: "主体居中", lighting: "自然光", audio: {}, sourceNodeIds: [],
  });
  let focusNodeIds = [];
  let mutableNodeIds = [];
  if (fixture.category === "script-only") {
    const ids = fixture.id === "script-02" ? [script("第一集", "ep01"), script("第二集", "ep02"), script("第三集", "ep03")] : [script()];
    focusNodeIds = fixture.id === "script-02" ? [ids[1]] : ids;
    mutableNodeIds = [...focusNodeIds];
  } else if (fixture.category === "asset-dedup-continuity") {
    const source = script();
    if (fixture.id === "asset-01") {
      const existing = asset("林野", "character:lin-ye");
      focusNodeIds = [source, existing];
      mutableNodeIds = [existing];
    }
    else if (fixture.id === "asset-03") {
      const existing = asset("主角", "character:lead", ["左眉伤疤"] );
      focusNodeIds = [source, existing];
      mutableNodeIds = [existing];
    }
    else focusNodeIds = [source];
  } else if (fixture.category === "local-storyboard-edit") {
    const shots = Array.from({ length: 8 }, (_, index) => shot(index));
    focusNodeIds = fixture.id === "shot-03" ? shots.slice(0, 4) : [shots[fixture.id === "shot-01" ? 2 : 4]];
    mutableNodeIds = [...focusNodeIds];
  } else if (fixture.category === "route-reference") {
    const target = fixture.id === "route-01"
      ? asset("主角", "character:lead", ["左眉有一道浅疤", "始终穿深蓝色连帽外套"], "二十多岁女性，短黑发，左眉浅疤，深蓝色连帽外套，银色机械腕表；写实电影感角色定妆照")
      : shot(0);
    focusNodeIds = [target];
    if (fixture.id !== "route-01") {
      const first = add({ name: "参考图 A", type: "image", action: "image_generate", generatorType: "default", content: ["固定评测角色参考图 A，写实电影感定妆照"] });
      focusNodeIds.push(first);
      if (fixture.id === "route-02") focusNodeIds.push(add({ name: "参考图 B", type: "image", action: "image_generate", generatorType: "default", content: ["固定评测角色参考图 B，与参考图 A 保持身份和服装连续"] }));
    }
  }
  return { nodes, focusNodeIds, mutableNodeIds, baselineNodes: [] };
}

function node(projectId, id, data, creativeSpec, index) {
  const now = new Date().toISOString();
  const type = data.type ?? "text";
  return {
    id, projectId, type, entityId: randomUUID(), positionX: (index % 4) * 360, positionY: Math.floor(index / 4) * 280,
    width: 320, height: 220,
    data: {
      type, name: data.name, action: data.action ?? "text_generate", content: data.content,
      url: data.url, workspaceFile: data.workspaceFile, generatorType: data.generatorType, params: { prompt: data.content?.join("\n") ?? "" },
      taskInfo: { status: data.url || data.workspaceFile ? "completed" : "idle" }, ...(creativeSpec ? { creativeSpec } : {}),
    },
    createdAt: now, updatedAt: now,
  };
}

async function request(url, options = {}) {
  const response = await fetch(`${baseUrl}${url}`, {
    method: options.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${options.method ?? "GET"} ${url}: ${body.error?.code ?? response.status} ${body.error?.message ?? response.statusText}`);
  return body;
}

function blocks(content) {
  if (Array.isArray(content)) return content;
  return content && typeof content === "object" ? [content] : typeof content === "string" ? [{ type: "text", text: content }] : [];
}

function specialistKind(name) {
  const match = /^pipeline_run_(script|asset|storyboard|prompt)_specialist$/.exec(name ?? "");
  return match?.[1] ?? null;
}

function bool(value) { return value ? "1" : "0"; }
function profileVersions(results = []) {
  return [...new Map(results
    .filter((result) => typeof result.kind === "string" && typeof result.profileVersion === "string")
    .map((result) => [result.kind, result.profileVersion])).entries()]
    .map(([kind, version]) => `${kind}=${version}`)
    .join(";");
}
function metricsPassed(metrics) {
  return metrics.routeCorrect === true
    && metrics.structureValid === true
    && metrics.planValid === true
    && (metrics.preflightPassed === null || metrics.preflightPassed === true)
    && metrics.duplicateAssets === 0
    && (metrics.outOfScopeMutations === null || metrics.outOfScopeMutations === 0)
    && metrics.generationRunsCreated === 0;
}
function csv(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function failedMetrics() {
  return { routeCorrect: false, structureValid: false, repairUsed: false, fallbackUsed: false, planValid: false, duplicateAssets: 0, preflightPassed: false, outOfScopeMutations: null, generationRunsCreated: 0 };
}
