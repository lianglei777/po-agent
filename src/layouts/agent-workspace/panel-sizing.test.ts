import { describe, expect, it } from "vitest";
import {
  COLLAPSED_PRIMARY_NAV_WIDTH,
  fitPanelWidths,
  getConversationWidthBounds,
  getEffectivePrimaryNavWidth,
  getInspectorWidthBounds,
  isNarrowWorkspace,
} from "./panel-sizing";

describe("agent workspace panel sizing", () => {
  it("keeps the chat width available while all desktop panels are open", () => {
    expect(getConversationWidthBounds(1440, 216, 420, true, true)).toEqual({
      min: 131,
      max: 131,
    });
    expect(getInspectorWidthBounds(1440, 216, 248, true, true)).toEqual({
      min: 303,
      max: 303,
    });
  });

  it("collapses the primary navigation before the inspector becomes overlayed", () => {
    expect(getEffectivePrimaryNavWidth(1439, true, 216)).toBe(
      COLLAPSED_PRIMARY_NAV_WIDTH,
    );
    expect(getEffectivePrimaryNavWidth(1440, true, 216)).toBe(216);
    expect(isNarrowWorkspace(1279)).toBe(true);
    expect(isNarrowWorkspace(1280)).toBe(false);
  });

  it("keeps stored desktop widths when they fit", () => {
    expect(
      fitPanelWidths(
        1440,
        { conversation: 248, inspector: 420, primaryNav: 216 },
        {
          conversationOpen: true,
          inspectorOpen: true,
          primaryNavExpanded: true,
          showInspectorDock: true,
        },
      ),
    ).toEqual({
      conversation: 231,
      inspector: 320,
      primaryNav: 216,
    });
  });

  it("uses overlay sizing at the 1024px desktop floor", () => {
    expect(
      fitPanelWidths(
        1024,
        { conversation: 248, inspector: 420, primaryNav: 216 },
        {
          conversationOpen: true,
          inspectorOpen: true,
          primaryNavExpanded: true,
          showInspectorDock: true,
        },
      ),
    ).toEqual({
      conversation: 248,
      inspector: 420,
      primaryNav: 216,
    });
  });
});
