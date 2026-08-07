"use client";

import { Check, GitBranch } from "@/components/icons";
import { Button, Dropdown, Tooltip } from "antd";
import { useI18n } from "@/i18n/use-i18n";
import { collectLeaves, leafSummary } from "./branch-leaves";
import type { SessionTreeNode } from "./agent-types";

export function BranchHistory({
  tree,
  activeLeafId,
  running,
  onChangeLeaf,
  compact = false,
}: {
  tree: SessionTreeNode[];
  activeLeafId: string | null;
  running: boolean;
  onChangeLeaf: (leafId: string) => void;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const leaves = collectLeaves(tree);
  if (leaves.length <= 1) return null;

  const menu = (
    <Dropdown
      disabled={running}
      menu={{
        items: leaves.map((node) => {
          const active = node.entry.id === activeLeafId;
          return {
            disabled: active,
            icon: (
              <Check
                className={active ? "size-3.5" : "size-3.5 opacity-0"}
              />
            ),
            key: node.entry.id,
            label: <span className="min-w-0 truncate">{leafSummary(node)}</span>,
            onClick: () => onChangeLeaf(node.entry.id),
          };
        }),
      }}
      placement="bottomRight"
      trigger={["click"]}
    >
      <Button
        className="h-7 px-2 text-meta"
        disabled={running}
        htmlType="button"
        icon={<GitBranch className="size-3.5" />}
        size="small"
      >
        {t.chat.message.branchHistory}
        <span className="text-dim">{leaves.length}</span>
      </Button>
    </Dropdown>
  );

  const content = running ? (
    <Tooltip
      mouseEnterDelay={0.35}
      placement="bottom"
      title={t.chat.message.branchNavigationUnavailableWhileRunning}
    >
      <span className="inline-flex">{menu}</span>
    </Tooltip>
  ) : (
    menu
  );

  if (compact) return content;

  return (
    <div className="flex items-center justify-end border-b border-line-subtle px-4 py-1.5">
      {content}
    </div>
  );
}
