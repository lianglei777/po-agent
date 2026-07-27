import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LAYOUT_PREFERENCES,
  readLayoutPreferences,
  writeLayoutPreferences,
} from "./layout-preferences";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("workspace layout preferences", () => {
  it("falls back safely when stored data is invalid", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => "{not-json",
      },
    });

    expect(readLayoutPreferences()).toEqual(DEFAULT_LAYOUT_PREFERENCES);
  });

  it("preserves valid visibility and panel width preferences", () => {
    const setItem = vi.fn();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () =>
          JSON.stringify({
            conversationOpen: false,
            inspectorOpen: true,
            primaryNavExpanded: false,
            widths: {
              conversation: 280,
              inspector: 510,
              primaryNav: 240,
            },
          }),
        setItem,
      },
    });

    const preferences = readLayoutPreferences();
    expect(preferences).toEqual({
      conversationOpen: false,
      inspectorOpen: true,
      primaryNavExpanded: false,
      widths: {
        conversation: 280,
        inspector: 510,
        primaryNav: 240,
      },
    });

    writeLayoutPreferences(preferences);
    expect(setItem).toHaveBeenCalledWith(
      "po.workspace.layout.v1",
      JSON.stringify(preferences),
    );
  });
});
