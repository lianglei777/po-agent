import { describe, expect, it } from "vitest";
import type { SessionTreeNode } from "./types";
import { filterSessionNodes } from "./conversation-sidebar";

function node(
  id: string,
  name: string,
  children: SessionTreeNode[] = [],
): SessionTreeNode {
  return {
    children,
    session: {
      created: "2026-07-24T00:00:00.000Z",
      cwd: "D:\\code\\po-agent",
      firstMessage: "",
      id,
      messageCount: 1,
      modified: "2026-07-24T00:00:00.000Z",
      name,
      path: `D:\\sessions\\${id}.jsonl`,
    },
  };
}

describe("conversation filtering", () => {
  it("keeps matching branches and their ancestors", () => {
    const tree = [
      node("root", "Build workspace", [
        node("child", "Fix inspector sizing"),
      ]),
      node("other", "Unrelated task"),
    ];

    expect(filterSessionNodes(tree, "inspector")).toEqual([
      node("root", "Build workspace", [
        node("child", "Fix inspector sizing"),
      ]),
    ]);
  });

  it("returns the original tree when the query is blank", () => {
    const tree = [node("root", "Build workspace")];
    expect(filterSessionNodes(tree, "   ")).toBe(tree);
  });
});
