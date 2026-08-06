import { describe, expect, it } from "vitest";
import type { Project, SessionInfo } from "../types";
import { createSessionNavigationStore } from "./session-navigation-store";

const project: Project = {
  path: "D:\\code\\project-a",
  aliases: ["D:\\code\\project-a"],
};

const session: SessionInfo = {
  id: "session-1",
  path: "D:\\code\\project-a\\session-1.jsonl",
  cwd: project.path,
  created: "2026-08-06T01:00:00.000Z",
  modified: "2026-08-06T01:30:00.000Z",
  messageCount: 2,
  firstMessage: "Hello",
};

describe("session navigation store", () => {
  it("applies refresh results as one transition", () => {
    const store = createSessionNavigationStore({
      loading: true,
      error: "previous error",
    });

    store.getState().completeRefresh([project], [session], true);

    expect(store.getState()).toMatchObject({
      projects: [project],
      sessions: [session],
      loading: false,
      error: "",
    });
  });

  it("does not let a background refresh finish the initial loading state", () => {
    const store = createSessionNavigationStore({ loading: true });

    store.getState().completeRefresh([project], [session], false);

    expect(store.getState().loading).toBe(true);
  });

  it("keeps only one project removal in flight", () => {
    const store = createSessionNavigationStore({ projects: [project] });

    expect(store.getState().beginProjectRemoval(project.path)).toBe(true);
    expect(store.getState().beginProjectRemoval("D:\\code\\project-b")).toBe(
      false,
    );

    store.getState().completeProjectRemoval(project.path);
    expect(store.getState()).toMatchObject({
      projects: [],
      projectError: "",
      removingProject: null,
    });
  });

  it("preserves projects and exposes removal failures", () => {
    const store = createSessionNavigationStore({ projects: [project] });
    store.getState().beginProjectRemoval(project.path);

    store.getState().failProjectRemoval("unable to remove project");

    expect(store.getState()).toMatchObject({
      projects: [project],
      projectError: "unable to remove project",
      removingProject: null,
    });
  });
});
