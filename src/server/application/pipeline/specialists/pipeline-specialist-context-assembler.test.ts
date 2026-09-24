import { describe, expect, it, vi } from "vitest";
import type { CanvasNode } from "@/server/domain/pipeline";
import type { PipelineSpecialistProfile, PipelineSpecialistRequest } from "@/server/domain/pipeline-specialist";
import type { PipelineRepository } from "@/server/ports/pipeline-repository";
import { PipelineSpecialistContextAssembler } from "./pipeline-specialist-context-assembler";

describe("PipelineSpecialistContextAssembler", () => {
  it("keeps the global creative-spec index compact on a developed storyboard canvas", async () => {
    const nodes = Array.from({ length: 14 }, (_, index) => shotNode(`shot-${index}`, index));
    const repository = {
      getProject: vi.fn(async () => ({ id: "project-1", title: "咖啡", originalText: "" })),
      listCanvasNodes: vi.fn(async () => nodes),
      listCanvasEdges: vi.fn(async () => []),
      getCanvasContinuityBible: vi.fn(async () => null),
    } as unknown as PipelineRepository;
    const assembler = new PipelineSpecialistContextAssembler(repository);
    const request: PipelineSpecialistRequest = {
      projectId: "project-1",
      sessionId: "session-1",
      objective: "为前两个镜头创建视频节点",
      sourceNodeIds: ["shot-0", "shot-1"],
      targetNodeIds: [],
      constraints: { preserveUserText: true, aspectRatio: "9:16" },
    };
    const profile: PipelineSpecialistProfile = {
      kind: "prompt",
      version: "1.0.0",
      systemPrompt: "prompt",
      skillInstructions: "skill",
      maxInputCharacters: 56_000,
      maxOutputTokens: 6_000,
      temperature: 0.1,
      requestTimeoutMs: 180_000,
    };

    const context = await assembler.assemble(request, profile, []);

    expect(context.length).toBeLessThan(profile.maxInputCharacters);
    expect(context).toContain('"shotKey":"shot-13"');
    expect(context.match(/UNSELECTED_FULL_VISUAL_MARKER/g)).toHaveLength(2);
  });
});

function shotNode(id: string, order: number): CanvasNode {
  const selectedText = `镜头 ${order} ${"画面细节".repeat(900)}`;
  return {
    id,
    projectId: "project-1",
    type: "text",
    entityId: id,
    positionX: 0,
    positionY: 0,
    width: null,
    height: null,
    data: {
      type: "text",
      name: id,
      action: "text_generate",
      content: [selectedText],
      params: {},
      creativeSpec: {
        schemaVersion: 1,
        kind: "shot",
        shotKey: id,
        order,
        durationSeconds: 3,
        purpose: "验证上下文预算",
        visual: `${"丰富的镜头视觉描述".repeat(700)}UNSELECTED_FULL_VISUAL_MARKER`,
        subjects: [{ identityKey: "barista", action: "制作咖啡" }],
        shotSize: "特写",
        cameraMovement: "缓慢推进",
        blocking: "吧台前",
        lighting: "清晨侧光",
        audio: { ambience: "咖啡店" },
        sourceNodeIds: ["script-1"],
      },
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as CanvasNode;
}
