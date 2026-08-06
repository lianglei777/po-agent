import type { SessionTreeNode } from "./agent-types";

// 这是 Chat 暴露给 Workspace 的最小分支摘要，内部消息流与请求状态不跨 feature 边界。
export type BranchState = {
  tree: SessionTreeNode[];
  activeLeafId: string | null;
  running: boolean;
  busy: boolean;
  changeLeaf: (leafId: string) => Promise<boolean>;
};
