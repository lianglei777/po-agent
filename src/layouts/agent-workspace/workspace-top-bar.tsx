import {
  PanelLeftOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useI18n } from "@/i18n/use-i18n";
import type { SessionTreeNode } from "@/features/chat/agent-types";
import { BranchHistory } from "@/features/chat/branch-history";
import type { WorkspaceView } from "./workspace-navigation";

type WorkspaceTopBarProps = {
  activeView: WorkspaceView;
  conversationOpen: boolean;
  onToggleConversation: () => void;
  projectName: string | null;
  sessionTitle: string | null;
  showBranchHistory?: boolean;
  branchTree?: SessionTreeNode[];
  branchActiveLeafId?: string | null;
  branchRunning?: boolean;
  onBranchChangeLeaf?: (leafId: string) => void;
};

export function WorkspaceTopBar({
  activeView,
  conversationOpen,
  onToggleConversation,
  projectName,
  sessionTitle,
  showBranchHistory,
  branchTree,
  branchActiveLeafId,
  branchRunning,
  onBranchChangeLeaf,
}: WorkspaceTopBarProps) {
  const { t } = useI18n();
  const title =
    activeView === "model-provider"
      ? t.workspace.settings
      : sessionTitle ?? t.workspace.newChat;

  return (
    <header className="flex h-11 flex-none items-center border-b border-line-subtle bg-canvas px-2">
      {activeView === "chat" && !conversationOpen ? (
        <TopBarIconButton
          label={t.workspace.showConversations}
          onClick={onToggleConversation}
        >
          <PanelLeftOpen />
        </TopBarIconButton>
      ) : null}

      <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
        {activeView === "chat" && projectName ? (
          <>
            <span className="truncate text-meta font-medium text-muted">
              {projectName}
            </span>
            <span aria-hidden className="text-dim">
              /
            </span>
          </>
        ) : null}
        <div className="truncate text-sm font-semibold text-primary">{title}</div>
      </div>

      {/* 分支历史按钮 */}
      {showBranchHistory &&
      branchTree &&
      onBranchChangeLeaf ? (
        <div className="mr-1">
          <BranchHistory
            activeLeafId={branchActiveLeafId ?? null}
            compact
            onChangeLeaf={onBranchChangeLeaf}
            running={branchRunning ?? false}
            tree={branchTree}
          />
        </div>
      ) : null}

    </header>
  );
}

function TopBarIconButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          className="text-muted"
          onClick={onClick}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
