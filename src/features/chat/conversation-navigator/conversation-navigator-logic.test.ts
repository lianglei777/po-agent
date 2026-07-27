import { describe, expect, it } from "vitest";
import { selectActiveConversationEntry } from "./conversation-navigator-logic";

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
