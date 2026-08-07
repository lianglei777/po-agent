import { describe, expect, it } from "vitest";
import type {
  GenerationRouteDto,
  GenerationRunViewDto,
} from "@/contracts/generation";
import { createContentGenerationStore } from "./content-generation-store";

const route = (id: string, enabled = true): GenerationRouteDto => ({
  id,
  name: id,
  capability: "text-to-image",
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
    store.getState().applyCenterData(
      [route("disabled", false), route("route-a")],
      [run("run-a", "queued")],
    );

    expect(store.getState()).toMatchObject({
      selectedRouteId: "route-a",
      centerLoading: false,
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

  it("replaces a durable run while preserving its list position", () => {
    const store = createContentGenerationStore({
      runs: [run("run-a", "queued"), run("run-b", "queued")],
    });
    store.getState().replaceRun(run("run-a", "succeeded"));

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
    store.getState().resetCenter();

    expect(store.getState()).toMatchObject({
      routes: [route("route-a")],
      runs: [],
      selectedRouteId: "",
      centerLoading: true,
      providerEnabled: true,
      hasCredential: true,
    });
  });

  it("isolates workspace instances", () => {
    const first = createContentGenerationStore();
    const second = createContentGenerationStore();
    first.getState().setProviderEnabled(true);
    expect(second.getState().providerEnabled).toBe(false);
  });
});
