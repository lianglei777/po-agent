import { describe, expect, it } from "vitest";
import type { SessionInfo } from "@/features/sessions/types";
import { createWorkspaceStore } from "./workspace-store";

const session: SessionInfo = {
  id: "session-1",
  path: "D:\\code\\project-a\\session-1.jsonl",
  cwd: "D:\\code\\project-a",
  created: "2026-08-06T01:00:00.000Z",
  modified: "2026-08-06T01:30:00.000Z",
  messageCount: 2,
  firstMessage: "Hello",
};

describe("agent workspace store", () => {
  it("coordinates session selection as one transition", () => {
    const store = createWorkspaceStore({
      activeView: "model-provider",
      newSessionCwd: "D:\\code\\draft",
      sessionSurface: "generation",
      chatInstanceKey: 3,
    });

    store.getState().selectSession(session);

    expect(store.getState()).toMatchObject({
      activeView: "chat",
      activeCwd: session.cwd,
      selectedSession: session,
      newSessionCwd: null,
      draftSession: null,
      sessionSurface: "chat",
      chatInstanceKey: 4,
    });
  });

  it("resets session-scoped state when the workspace changes", () => {
    const store = createWorkspaceStore({
      selectedSession: session,
      activeCwd: session.cwd,
      openFile: { path: "README.md", name: "README.md" },
      currentSystemPrompt: "prompt",
      instructionsNeedApply: true,
    });

    store.getState().changeCwd("D:\\code\\project-b");

    expect(store.getState()).toMatchObject({
      activeCwd: "D:\\code\\project-b",
      selectedSession: null,
      newSessionCwd: "D:\\code\\project-b",
      openFile: null,
      currentSystemPrompt: null,
      instructionsNeedApply: false,
    });
  });

  it("replaces only the selected session after deletion", () => {
    const store = createWorkspaceStore({ selectedSession: session });
    const replacement = {
      id: "draft-2",
      cwd: session.cwd,
      created: "2026-08-06T02:00:00.000Z",
    };

    expect(
      store.getState().replaceDeletedSession(
        { ...session, id: "another-session" },
        replacement,
      ),
    ).toBe(false);
    expect(store.getState().selectedSession).toEqual(session);

    expect(
      store.getState().replaceDeletedSession(session, replacement),
    ).toBe(true);
    expect(store.getState()).toMatchObject({
      selectedSession: null,
      newSessionCwd: session.cwd,
      draftSession: replacement,
      sessionSurface: "chat",
    });
  });

  it("increments cross-feature revisions without replacing remote data", () => {
    const store = createWorkspaceStore({ selectedSession: session });

    store.getState().markAgentEnd();
    store.getState().markInstructionsChanged();
    store.getState().markModelsSaved();

    expect(store.getState()).toMatchObject({
      sessionRefreshKey: 1,
      explorerRefreshKey: 2,
      modelsRevision: 1,
      instructionsNeedApply: true,
    });
  });

  it("clears every guarded dirty state after discard", () => {
    const store = createWorkspaceStore({
      modelProviderDirty: true,
      contentGenerationDirty: true,
      systemPromptDirty: true,
      projectInstructionsDirty: true,
      projectInstructionsOpen: true,
    });

    store.getState().discardNavigationChanges();

    expect(store.getState()).toMatchObject({
      modelProviderDirty: false,
      contentGenerationDirty: false,
      systemPromptDirty: false,
      projectInstructionsDirty: false,
      projectInstructionsOpen: false,
    });
  });
});
