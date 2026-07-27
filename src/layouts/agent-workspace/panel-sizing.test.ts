import { describe, expect, it } from "vitest";
import {
  COLLAPSED_PRIMARY_NAV_WIDTH,
  HIDDEN_PRIMARY_NAV_WIDTH,
  fitPanelWidths,
  getConversationWidthBounds,
  getEffectivePrimaryNavWidth,
  getInspectorWidthBounds,
  isNarrowWorkspace,
} from "./panel-sizing";

describe("agent workspace panel sizing", () => {
  it("keeps the chat width available while all desktop panels are open", () => {
    expect(getConversationWidthBounds(1440, 216, 420, true, true)).toEqual({
      min: 132,
      max: 132,
    });
    expect(getInspectorWidthBounds(1440, 216, 248, true, true)).toEqual({
      min: 304,
      max: 304,
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

  it("fully hides the primary navigation when the user collapses it", () => {
    expect(getEffectivePrimaryNavWidth(1024, false, 216)).toBe(
      HIDDEN_PRIMARY_NAV_WIDTH,
    );
    expect(getEffectivePrimaryNavWidth(1920, false, 216)).toBe(
      HIDDEN_PRIMARY_NAV_WIDTH,
    );
  });

  it("keeps stored desktop widths when they fit", () => {
    expect(
      fitPanelWidths(
        1440,
        { conversation: 248, inspector: 420 },
        {
          conversationOpen: true,
          inspectorOpen: true,
          primaryNavExpanded: true,
          showInspectorDock: true,
        },
      ),
    ).toEqual({
      conversation: 232,
      inspector: 320,
    });
  });

  it("uses overlay sizing at the 1024px desktop floor", () => {
    expect(
      fitPanelWidths(
        1024,
        { conversation: 248, inspector: 420 },
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
    });
  });
});
