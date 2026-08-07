import { describe, expect, it } from "vitest";
import { createFilesStore } from "./files-store";

describe("files store", () => {
  it("applies collection updates against the latest tree state", () => {
    const store = createFilesStore();
    store.getState().setExpanded((current) => new Set(current).add("/a"));
    store.getState().setExpanded((current) => new Set(current).add("/b"));
    expect([...store.getState().expanded]).toEqual(["/a", "/b"]);
  });

  it("resets project tree state", () => {
    const store = createFilesStore({
      entriesByPath: { "/a": [] },
      expanded: new Set(["/a"]),
      error: "failed",
    });
    store.getState().resetTree();
    expect(store.getState()).toMatchObject({ entriesByPath: {}, error: "" });
    expect(store.getState().expanded.size).toBe(0);
  });

  it("isolates mutable collections between panels", () => {
    const first = createFilesStore();
    const second = createFilesStore();
    first.getState().setLoading((current) => new Set(current).add("/a"));
    expect(second.getState().loading.size).toBe(0);
  });
});
