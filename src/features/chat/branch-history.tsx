"use client";

import { Check, GitBranch } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="h-7 gap-1.5 px-2 text-meta"
          size="sm"
          type="button"
          variant="outline"
          disabled={running}
        >
          <GitBranch className="size-3.5" />
          {t.chat.message.branchHistory}
          <span className="text-dim">{leaves.length}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom">
        {leaves.map((node) => {
          const active = node.entry.id === activeLeafId;
          return (
            <DropdownMenuItem
              key={node.entry.id}
              disabled={active}
              onSelect={() => onChangeLeaf(node.entry.id)}
            >
              <Check className={active ? "size-3.5" : "size-3.5 opacity-0"} />
              <span className="min-w-0 truncate">
                {leafSummary(node)}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const content = running ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{menu}</span>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {t.chat.message.branchNavigationUnavailableWhileRunning}
      </TooltipContent>
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
