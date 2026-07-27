import { describe, expect, it } from "vitest";
import {
  selectActiveConversationEntry,
  waveLineWidth,
} from "./conversation-navigator-logic";

const anchors = [
  { id: "first", top: 100 },
  { id: "second", top: 400 },
  { id: "third", top: 800 },
];

describe("selectActiveConversationEntry", () => {
  it("selects the last entry that has crossed the reading reference", () => {
    expect(
      selectActiveConversationEntry({
        anchors,
        atLatest: false,
        referenceTop: 450,
      }),
    ).toBe("second");
  });

  it("keeps the first entry active before the first anchor", () => {
    expect(
      selectActiveConversationEntry({
        anchors,
        atLatest: false,
        referenceTop: 50,
      }),
    ).toBe("first");
  });

  it("selects the last entry when the conversation is at the bottom", () => {
    expect(
      selectActiveConversationEntry({
        anchors,
        atLatest: true,
        referenceTop: 100,
      }),
    ).toBe("third");
  });
});

describe("waveLineWidth", () => {
  it("expands the hovered mark and tapers neighboring marks", () => {
    expect(
      [0, 1, 2, 3, 4, 5, 6].map((index) =>
        waveLineWidth({ active: false, hoveredIndex: 3, index }),
      ),
    ).toEqual([12, 17, 23, 30, 23, 17, 12]);
  });

  it("keeps the current turn visible outside hover state", () => {
    expect(waveLineWidth({ active: true, hoveredIndex: -1, index: 2 })).toBe(
      18,
    );
    expect(waveLineWidth({ active: false, hoveredIndex: -1, index: 3 })).toBe(
      7,
    );
  });
});
