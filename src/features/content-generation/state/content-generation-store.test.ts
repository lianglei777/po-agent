import { describe, expect, it } from "vitest";
import type {
  GenerationRouteDto,
  GenerationRunViewDto,
} from "@/contracts/generation";
import { createContentGenerationStore } from "./content-generation-store";

const route = (id: string, enabled = true): GenerationRouteDto => ({
  id,
  name: id,
  description: `${id} description`,
  tags: [id],
  capability: "text-to-image",
  product: "Test Product",
  providerId: "provider",
  enabled,
  isDefault: false,
  revision: 1,
  defaults: {},
  inputSchema: { prompt: { required: true } },
});

const run = (id: string, status: "queued" | "succeeded"): GenerationRunViewDto => ({
  run: {
    id,
    sessionId: "session",
    capability: "text-to-image",
    routeId: "route-a",
    status,
    prompt: "prompt",
    input: { prompt: "prompt" },
    source: "direct-ui",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  jobs: [],
  artifacts: [],
});

describe("content generation store", () => {
  it("selects an enabled route when center data arrives", () => {
    const store = createContentGenerationStore({ selectedRouteId: "disabled" });
    const revision = store.getState().activateCenterSession("session");
    store.getState().applyCenterData(
      "session",
      revision,
      [route("disabled", false), route("route-a")],
      [run("run-a", "queued")],
    );

    expect(store.getState()).toMatchObject({
      selectedRouteId: "route-a",
      centerLoading: false,
      centerLoadError: "",
      centerError: "",
    });
  });

  it("updates shared route configuration without replacing run state", () => {
    const store = createContentGenerationStore({
      routes: [route("route-a")],
      runs: [run("run-a", "queued")],
    });
    store.getState().updateRoute(route("route-a", false));

    expect(store.getState().routes[0]?.enabled).toBe(false);
    expect(store.getState().runs[0]?.run.id).toBe("run-a");
  });

  it("reconciles route selection when settings disable the active route", () => {
    const store = createContentGenerationStore({
      routes: [route("route-a"), route("route-b")],
      selectedRouteId: "route-a",
    });
    store.getState().updateRoute(route("route-a", false));
    expect(store.getState().selectedRouteId).toBe("route-b");
  });

  it("demotes the previous local default when a new default response arrives", () => {
    const first = { ...route("route-a"), isDefault: true };
    const second = route("route-b");
    const store = createContentGenerationStore({ routes: [first, second] });

    store.getState().updateRoute({ ...second, isDefault: true });

    expect(store.getState().routes).toMatchObject([
      { id: "route-a", isDefault: false },
      { id: "route-b", isDefault: true },
    ]);
  });

  it("mirrors the server fallback when the active default is disabled", () => {
    const first = { ...route("route-a"), isDefault: true };
    const second = route("route-b");
    const store = createContentGenerationStore({ routes: [first, second] });

    store.getState().updateRoute({ ...first, enabled: false, isDefault: false });

    expect(store.getState().routes).toMatchObject([
      { id: "route-a", enabled: false, isDefault: false },
      { id: "route-b", enabled: true, isDefault: true },
    ]);
  });

  it("starts a fresh settings load without clearing shared route data", () => {
    const store = createContentGenerationStore({
      routes: [route("route-a")],
      settingsLoading: false,
      settingsError: "stale error",
    });

    store.getState().beginSettingsLoad();

    expect(store.getState()).toMatchObject({
      routes: [route("route-a")],
      settingsLoading: true,
      settingsError: "",
    });
  });

  it("replaces a durable run while preserving its list position", () => {
    const store = createContentGenerationStore({
      runs: [run("run-a", "queued"), run("run-b", "queued")],
    });
    const revision = store.getState().activateCenterSession("session");
    store.getState().setRuns("session", revision, [
      run("run-a", "queued"),
      run("run-b", "queued"),
    ]);
    store
      .getState()
      .replaceRun("session", revision, run("run-a", "succeeded"));

    expect(store.getState().runs.map((view) => view.run.status)).toEqual([
      "succeeded",
      "queued",
    ]);
  });

  it("resets session-scoped runs without clearing workspace settings", () => {
    const store = createContentGenerationStore({
      routes: [route("route-a")],
      runs: [run("run-a", "queued")],
      selectedRouteId: "route-a",
      providerEnabled: true,
      hasCredential: true,
    });
    const revision = store.getState().activateCenterSession("session-b");

    expect(store.getState()).toMatchObject({
      routes: [route("route-a")],
      centerSessionId: "session-b",
      centerRevision: revision,
      runs: [],
      selectedRouteId: "",
      centerLoading: true,
      providerEnabled: true,
      hasCredential: true,
    });
  });

  it("rejects late writes from a previous session", () => {
    const store = createContentGenerationStore();
    const revisionA = store.getState().activateCenterSession("session-a");
    store.getState().applyCenterData(
      "session-a",
      revisionA,
      [route("route-a")],
      [run("run-a", "queued")],
    );

    const revisionB = store.getState().activateCenterSession("session-b");
    store.getState().applyCenterData(
      "session-b",
      revisionB,
      [route("route-b")],
      [{
        ...run("run-b", "queued"),
        run: { ...run("run-b", "queued").run, sessionId: "session-b" },
      }],
    );

    expect(
      store
        .getState()
        .setRuns("session-a", revisionA, [run("late-a", "succeeded")]),
    ).toBe(false);
    expect(
      store
        .getState()
        .setCenterError("session-a", revisionA, "late error"),
    ).toBe(false);
    expect(store.getState()).toMatchObject({
      centerSessionId: "session-b",
      centerError: "",
    });
    expect(store.getState().runs.map((view) => view.run.id)).toEqual([
      "run-b",
    ]);
  });

  it("rejects late writes after the same session is remounted", () => {
    const store = createContentGenerationStore();
    const staleRevision = store.getState().activateCenterSession("session-a");
    const currentRevision = store.getState().activateCenterSession("session-a");

    expect(
      store
        .getState()
        .setRuns("session-a", staleRevision, [run("stale", "succeeded")]),
    ).toBe(false);
    expect(
      store
        .getState()
        .setRuns("session-a", currentRevision, [run("current", "queued")]),
    ).toBe(true);
    expect(store.getState().runs[0]?.run.id).toBe("current");
  });

  it("keeps initial load failures scoped to the owning session revision", () => {
    const store = createContentGenerationStore();
    const staleRevision = store.getState().activateCenterSession("session-a");
    const currentRevision = store.getState().activateCenterSession("session-a");

    expect(
      store
        .getState()
        .setCenterLoadError("session-a", staleRevision, "stale failure"),
    ).toBe(false);
    expect(
      store
        .getState()
        .setCenterLoadError("session-a", currentRevision, "current failure"),
    ).toBe(true);
    expect(store.getState().centerLoadError).toBe("current failure");
  });

  it("isolates workspace instances", () => {
    const first = createContentGenerationStore();
    const second = createContentGenerationStore();
    first.getState().setProviderEnabled(true);
    expect(second.getState().providerEnabled).toBe(false);
  });
});
