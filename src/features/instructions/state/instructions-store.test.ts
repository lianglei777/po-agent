import { describe, expect, it } from "vitest";
import { createInstructionsStore } from "./instructions-store";

describe("instructions store", () => {
  it("updates editor state from the latest draft", () => {
    const store = createInstructionsStore();
    store.getState().setGlobalEditor((state) => ({ ...state, draft: "first" }));
    store.getState().setGlobalEditor((state) => ({ ...state, error: state.draft }));
    expect(store.getState().globalEditor.error).toBe("first");
  });

  it("keeps project and global workflows independent", () => {
    const store = createInstructionsStore();
    store.getState().setProjectEditor((state) => ({ ...state, saving: true }));
    expect(store.getState().projectEditor.saving).toBe(true);
    expect(store.getState().globalEditor.saving).toBe(false);
  });

  it("isolates editor instances", () => {
    const first = createInstructionsStore();
    const second = createInstructionsStore();
    first.getState().setActiveView("global");
    expect(second.getState().activeView).toBe("effective");
  });
});
