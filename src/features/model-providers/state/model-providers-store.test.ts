import { describe, expect, it } from "vitest";
import { createModelProvidersStore } from "./model-providers-store";

describe("model providers store", () => {
  it("updates provider config from the latest state", () => {
    const store = createModelProvidersStore();

    store.getState().setConfig({ providers: { first: {} } });
    store.getState().setConfig((current) => ({
      ...current,
      providers: { ...current.providers, second: {} },
    }));

    expect(Object.keys(store.getState().config.providers ?? {})).toEqual([
      "first",
      "second",
    ]);
  });

  it("keeps save feedback transitions explicit", () => {
    const store = createModelProvidersStore();

    store.getState().setSaving(true);
    store.getState().setSaveError("failed");
    store.getState().setSaveRetryAvailable(true);

    expect(store.getState()).toMatchObject({
      saving: true,
      saveError: "failed",
      saveRetryAvailable: true,
    });
  });

  it("isolates model configuration between page instances", () => {
    const first = createModelProvidersStore();
    const second = createModelProvidersStore();

    first.getState().setSelection({ type: "provider", name: "custom" });

    expect(first.getState().selection).toEqual({
      type: "provider",
      name: "custom",
    });
    expect(second.getState().selection).toBeNull();
  });
});
