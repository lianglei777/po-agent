import { describe, expect, it } from "vitest";
import type { CanvasNode } from "@/server/domain/pipeline";
import { compileSpecialistDraft } from "./specialist-compilers";
import { parseSpecialistDraft } from "./specialist-drafts";

describe("Pipeline Specialist draft compilation", () => {
  it("normalizes concise model warning strings into non-blocking warnings", () => {
    const draft = parseSpecialistDraft("asset", JSON.stringify({
      kind: "asset", summary: "无变化", warnings: ["未发现关键道具"], assets: [], unresolvedMentions: [],
    }));
    expect(draft.warnings).toEqual([{ code: "SPECIALIST_WARNING", message: "未发现关键道具", nodeIds: [], blocking: false }]);
  });

  it("normalizes scalar and partial warning values without weakening deterministic validation", () => {
    const draft = parseSpecialistDraft("asset", JSON.stringify({
      kind: "asset", summary: "无变化", warnings: [42, { message: "候选较弱" }], assets: [], unresolvedMentions: [],
    }));
    expect(draft.warnings).toEqual([
      { code: "SPECIALIST_WARNING", message: "42", nodeIds: [], blocking: false },
      { code: "SPECIALIST_WARNING", message: "候选较弱", nodeIds: [], blocking: false },
    ]);
  });
  it("compiles a drama script into editable episode text nodes with structured specs", () => {
    const draft = parseSpecialistDraft("script", JSON.stringify({
      kind: "script", summary: "拆成两集", warnings: [], format: "short-drama", title: "雨夜", logline: "失散兄妹重逢",
      episodes: [
        { key: "ep-1", title: "第一集", objective: "制造误会", estimatedDurationSeconds: 60,
          scenes: [{ key: "s1", heading: "雨夜街口", location: "街口", time: "夜", purpose: "相遇", content: "阿宁撑伞停下。", characterNames: ["阿宁"] }] },
        { key: "ep-2", title: "第二集", objective: "揭示身份", estimatedDurationSeconds: 65,
          scenes: [{ key: "s2", heading: "旧屋", location: "旧屋", time: "晨", purpose: "确认", content: "旧照片落地。", characterNames: ["阿宁", "阿川"] }] },
      ],
    }));

    const result = compileSpecialistDraft(draft, [], []);

    expect(result.operations).toHaveLength(2);
    expect(result.operations[0]).toMatchObject({
      type: "node.create", tempId: "script-1", mediaType: "text",
      group: { id: "episode:ep-1", name: "第一集" },
      creativeSpec: { kind: "script", level: "episode", key: "ep-1", estimatedDurationSeconds: 60 },
    });
  });

  it("deduplicates an existing asset by identity without adding a duplicate node", () => {
    const existing = textNode("asset-anning", {
      schemaVersion: 1, kind: "asset", assetType: "character", identityKey: "character:anning",
      canonicalName: "阿宁", aliases: [], visualDescription: "短发", continuityFacts: [], sourceNodeIds: [],
    });
    const draft = parseSpecialistDraft("asset", JSON.stringify({
      kind: "asset", summary: "复用角色", warnings: [], unresolvedMentions: [],
      assets: [{ action: "create", assetType: "character", identityKey: "character:anning", canonicalName: "阿宁",
        aliases: [], visualDescription: "黑色短发", continuityFacts: ["左眉有疤"], sourceNodeIds: [], confidence: "high" }],
    }));

    expect(compileSpecialistDraft(draft, [existing], [])).toEqual({ operations: [], affectedNodeIds: [existing.id] });
  });

  it("upgrades an exact legacy asset name instead of creating a duplicate", () => {
    const existing = legacyTextNode("legacy-anning", "资产 · 角色 · 阿宁", "# 阿宁\n旧角色描述");
    const draft = parseSpecialistDraft("asset", JSON.stringify({
      kind: "asset", summary: "升级旧资产", warnings: [], unresolvedMentions: [],
      assets: [{ action: "create", assetType: "character", identityKey: "character:anning", canonicalName: "阿宁",
        aliases: [], visualDescription: "黑色短发", continuityFacts: ["左眉有疤"], sourceNodeIds: [], confidence: "high" }],
    }));

    expect(compileSpecialistDraft(draft, [existing], []).operations).toEqual([
      expect.objectContaining({ type: "node.update", nodeId: existing.id, creativeSpec: expect.objectContaining({ identityKey: "character:anning" }) }),
    ]);
  });

  it("does not overwrite a script whose title matches an asset name", () => {
    const script = textNode("script-recorder", {
      schemaVersion: 1, kind: "script", level: "episode", key: "ep-1", title: "旧录音机",
      objective: "发现哥哥留下的录音", estimatedDurationSeconds: 12, characters: ["守塔人"], sourceNodeIds: [],
    });
    const draft = parseSpecialistDraft("asset", JSON.stringify({
      kind: "asset", summary: "提取录音机", warnings: [], unresolvedMentions: [],
      assets: [{ action: "create", assetType: "prop", identityKey: "old-cassette-recorder", canonicalName: "旧录音机",
        aliases: ["录音机"], visualDescription: "银灰色金属外壳", continuityFacts: [], sourceNodeIds: [script.id], confidence: "high" }],
    }));

    expect(compileSpecialistDraft(draft, [script], []).operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "node.create", tempId: "asset-1", creativeSpec: expect.objectContaining({ kind: "asset" }) }),
    ]));
  });

  it("creates a separate asset when the model explicitly targets a script node", () => {
    const script = textNode("script-recorder", {
      schemaVersion: 1, kind: "script", level: "episode", key: "ep-1", title: "旧录音机",
      objective: "发现哥哥留下的录音", estimatedDurationSeconds: 12, characters: ["守塔人"], sourceNodeIds: [],
    });
    const draft = parseSpecialistDraft("asset", JSON.stringify({
      kind: "asset", summary: "拆分同名道具", warnings: [], unresolvedMentions: [],
      assets: [{ action: "update", targetNodeId: script.id, assetType: "prop", identityKey: "old-cassette-recorder",
        canonicalName: "旧录音机", aliases: ["录音机"], visualDescription: "银灰色金属外壳",
        continuityFacts: [], sourceNodeIds: [script.id], confidence: "high" }],
    }));

    expect(compileSpecialistDraft(draft, [script], []).operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "node.create", tempId: "asset-1", creativeSpec: expect.objectContaining({ kind: "asset" }) }),
    ]));
    expect(compileSpecialistDraft(draft, [script], []).operations).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "node.update", nodeId: script.id }),
    ]));
  });

  it("requires confirmation when aliases match multiple existing assets", () => {
    const first = textNode("asset-1", { schemaVersion: 1, kind: "asset", assetType: "character", identityKey: "character:a",
      canonicalName: "林野", aliases: ["小林"], visualDescription: "短发", continuityFacts: [], sourceNodeIds: [] });
    const second = textNode("asset-2", { schemaVersion: 1, kind: "asset", assetType: "character", identityKey: "character:b",
      canonicalName: "林也", aliases: ["小林"], visualDescription: "长发", continuityFacts: [], sourceNodeIds: [] });
    const draft = parseSpecialistDraft("asset", JSON.stringify({
      kind: "asset", summary: "匹配别名", warnings: [], unresolvedMentions: [],
      assets: [{ action: "create", assetType: "character", identityKey: "character:xiaolin", canonicalName: "小林",
        aliases: [], visualDescription: "未知", continuityFacts: [], sourceNodeIds: [], confidence: "low" }],
    }));

    expect(() => compileSpecialistDraft(draft, [first, second], [])).toThrow(expect.objectContaining({ code: "PIPELINE_SPECIALIST_IDENTITY_AMBIGUOUS" }));
  });

  it("keeps semantic lineage separate from generation references", () => {
    const script = textNode("script-1", {
      schemaVersion: 1, kind: "script", level: "episode", key: "ep-1", title: "第一集", objective: "相遇",
      estimatedDurationSeconds: 60, characters: ["阿宁"], sourceNodeIds: [],
    });
    const draft = parseSpecialistDraft("storyboard", JSON.stringify({
      kind: "storyboard", summary: "建立镜头", warnings: [], episodeKey: "ep-1", sourceNodeIds: [script.id], totalDurationSeconds: 4,
      shots: [{ shotKey: "ep1-shot1", order: 0, durationSeconds: 4, purpose: "建立环境", visual: "雨夜街口",
        subjects: [{ identityKey: "character:anning", action: "停下" }], shotSize: "全景", cameraMovement: "缓慢推进",
        blocking: "人物居中", lighting: "冷色路灯" }],
    }));

    const result = compileSpecialistDraft(draft, [script], []);
    expect(result.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "node.create", creativeSpec: expect.objectContaining({ kind: "shot", durationSeconds: 4 }) }),
      expect.objectContaining({ type: "edge.create", source: script.id, target: "shot-1", edgeType: "derives_from" }),
    ]));
  });

  it("links shots to script specs without multiplying lineage edges for every asset context node", () => {
    const script = textNode("script-1", { schemaVersion: 1, kind: "script", level: "episode", key: "ep-1", title: "第一集",
      objective: "相遇", estimatedDurationSeconds: 4, characters: ["阿宁"], sourceNodeIds: [] });
    const asset = textNode("asset-1", { schemaVersion: 1, kind: "asset", assetType: "character", identityKey: "character:anning",
      canonicalName: "阿宁", aliases: [], visualDescription: "短发", continuityFacts: [], sourceNodeIds: [script.id] });
    const draft = parseSpecialistDraft("storyboard", JSON.stringify({
      kind: "storyboard", summary: "建立镜头", warnings: [], episodeKey: "ep-1", sourceNodeIds: [script.id, asset.id], totalDurationSeconds: 4,
      shots: [{ shotKey: "s1", order: 0, durationSeconds: 4, purpose: "开场", visual: "雨夜", subjects: [{ identityKey: "character:anning", action: "停下" }],
        shotSize: "全景", cameraMovement: "推进", blocking: "居中", lighting: "冷色" }],
    }));
    const result = compileSpecialistDraft(draft, [script, asset], []);
    expect(result.operations.filter((operation) => operation.type === "edge.create")).toEqual([
      expect.objectContaining({ source: script.id, target: "shot-1", edgeType: "derives_from" }),
    ]);
  });

  it("rejects storyboard totals that do not match the shot durations", () => {
    expect(() => parseSpecialistDraft("storyboard", JSON.stringify({
      kind: "storyboard", summary: "错误时长", warnings: [], sourceNodeIds: [], totalDurationSeconds: 60,
      shots: [{ shotKey: "s1", order: 0, durationSeconds: 4, purpose: "开场", visual: "街口",
        subjects: [], shotSize: "全景", cameraMovement: "固定", blocking: "居中", lighting: "日光" }],
    }))).toThrow(expect.objectContaining({ code: "PIPELINE_SPECIALIST_OUTPUT_INVALID" }));
  });

  it("normalizes a small storyboard duration arithmetic error into the closing shot", () => {
    const draft = parseSpecialistDraft("storyboard", JSON.stringify({
      kind: "storyboard", summary: "四十五秒分镜", warnings: [], sourceNodeIds: [], totalDurationSeconds: 45,
      shots: [
        { shotKey: "s1", order: 0, durationSeconds: 20, purpose: "开场", visual: "办公室",
          subjects: [], shotSize: "全景", cameraMovement: "固定", blocking: "居中", lighting: "冷光" },
        { shotKey: "s2", order: 1, durationSeconds: 21, purpose: "收尾", visual: "切黑",
          subjects: [], shotSize: "特写", cameraMovement: "固定", blocking: "居中", lighting: "暗光" },
      ],
    }));

    expect(draft).toMatchObject({
      kind: "storyboard",
      shots: [{ durationSeconds: 20 }, { durationSeconds: 25 }],
      warnings: [expect.objectContaining({ code: "STORYBOARD_DURATION_TOTAL_NORMALIZED", blocking: false })],
    });
  });

  it("distributes a small negative duration correction without creating a zero-length closing shot", () => {
    const draft = parseSpecialistDraft("storyboard", JSON.stringify({
      kind: "storyboard", summary: "四十五秒分镜", warnings: [], sourceNodeIds: [], totalDurationSeconds: 45,
      shots: [
        { shotKey: "s1", order: 0, durationSeconds: 45, purpose: "主体", visual: "办公室",
          subjects: [], shotSize: "全景", cameraMovement: "固定", blocking: "居中", lighting: "冷光" },
        { shotKey: "s2", order: 1, durationSeconds: 5, purpose: "收尾", visual: "切黑",
          subjects: [], shotSize: "特写", cameraMovement: "固定", blocking: "居中", lighting: "暗光" },
      ],
    }));

    expect(draft.kind).toBe("storyboard");
    if (draft.kind !== "storyboard") throw new Error("Expected storyboard draft");
    expect(draft.shots.reduce((sum, shot) => sum + shot.durationSeconds, 0)).toBe(45);
    expect(draft.shots[1]?.durationSeconds).toBe(0.5);
    expect(draft.shots[0]?.durationSeconds).toBe(44.5);
  });

  it("compiles a route-backed media node with explicit reference bindings", () => {
    const shot = textNode("shot-1", {
      schemaVersion: 1, kind: "shot", shotKey: "s1", order: 0, durationSeconds: 5, purpose: "开场", visual: "雨夜",
      subjects: [], shotSize: "全景", cameraMovement: "推进", blocking: "居中", lighting: "冷色", audio: {}, sourceNodeIds: [],
    });
    const reference = mediaNode("portrait-1", "image");
    const draft = parseSpecialistDraft("prompt", JSON.stringify({
      kind: "prompt", summary: "配置视频", warnings: [], configurations: [{ sourceSpecNodeId: shot.id, name: "镜头 1",
        mediaType: "video", routeId: "video-route", prompt: "雨夜中缓慢推进", settings: { durationSeconds: 5 },
        references: [{ sourceNodeId: reference.id, role: "first-frame", order: 0 }] }],
    }));

    const result = compileSpecialistDraft(draft, [shot, reference], []);
    expect(result.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "node.create", tempId: "media-1", mediaType: "video", routeId: "video-route" }),
      expect.objectContaining({ type: "edge.create", source: shot.id, target: "media-1", edgeType: "derives_from" }),
      expect.objectContaining({ type: "edge.create", source: reference.id, target: "media-1", edgeType: "references", role: "first-frame" }),
    ]));
  });

  it("updates the sole media node derived from a spec instead of duplicating it", () => {
    const shot = textNode("shot-1", { schemaVersion: 1, kind: "shot", shotKey: "s1", order: 0, durationSeconds: 5,
      purpose: "开场", visual: "雨夜", subjects: [], shotSize: "全景", cameraMovement: "推进", blocking: "居中", lighting: "冷色", audio: {}, sourceNodeIds: [] });
    const existing = mediaNode("video-1", "video");
    const draft = parseSpecialistDraft("prompt", JSON.stringify({
      kind: "prompt", summary: "更新视频配置", warnings: [], configurations: [{ sourceSpecNodeId: shot.id, name: "镜头 1",
        mediaType: "video", routeId: "video-route", prompt: "雨夜推进", settings: { durationSeconds: 5 }, references: [] }],
    }));
    const edge = { id: "edge-1", projectId: "project-1", sourceNodeId: shot.id, targetNodeId: existing.id,
      edgeType: "derives_from" as const, order: 0, createdAt: "now", updatedAt: "now" };

    expect(compileSpecialistDraft(draft, [shot, existing], [edge]).operations).toEqual([
      expect.objectContaining({ type: "node.update", nodeId: existing.id, routeId: "video-route" }),
    ]);
  });
});

function textNode(id: string, creativeSpec: NonNullable<NonNullable<CanvasNode["data"]>["creativeSpec"]>): CanvasNode {
  return {
    id, projectId: "project-1", type: "text", entityId: `${id}-entity`, positionX: 0, positionY: 0,
    width: 320, height: 220, data: { type: "text", name: id, action: "text_generate", creativeSpec, params: { prompt: "" }, taskInfo: { status: "idle" } },
    createdAt: "now", updatedAt: "now",
  };
}

function mediaNode(id: string, type: "image" | "video" | "audio"): CanvasNode {
  return {
    id, projectId: "project-1", type, entityId: `${id}-entity`, positionX: 0, positionY: 0,
    width: 320, height: 220, data: { type, name: id, action: `${type}_generate`, params: { prompt: "" }, taskInfo: { status: "idle" } },
    createdAt: "now", updatedAt: "now",
  };
}

function legacyTextNode(id: string, name: string, content: string): CanvasNode {
  return {
    id, projectId: "project-1", type: "text", entityId: `${id}-entity`, positionX: 0, positionY: 0,
    width: 320, height: 220, data: { type: "text", name, action: "text_generate", content: [content], params: { prompt: "" }, taskInfo: { status: "idle" } },
    createdAt: "now", updatedAt: "now",
  };
}
