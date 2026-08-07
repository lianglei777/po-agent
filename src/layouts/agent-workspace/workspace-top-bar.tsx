import { Images, MessageSquare, PanelLeft, PanelLeftOpen } from "@/components/icons";
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
  onExpandPrimaryNavigation: () => void;
  onToggleConversation: () => void;
  primaryNavigationHidden: boolean;
  showBranchHistory?: boolean;
  branchTree?: SessionTreeNode[];
  branchActiveLeafId?: string | null;
  branchRunning?: boolean;
  onBranchChangeLeaf?: (leafId: string) => void;
  sessionSurface?: "chat" | "generation";
  onSessionSurfaceChange?: (surface: "chat" | "generation") => void;
};

export function WorkspaceTopBar({
  activeView,
  conversationOpen,
  onExpandPrimaryNavigation,
  onToggleConversation,
  primaryNavigationHidden,
  showBranchHistory,
  branchTree,
  branchActiveLeafId,
  branchRunning,
  onBranchChangeLeaf,
  sessionSurface,
  onSessionSurfaceChange,
}: WorkspaceTopBarProps) {
  const { t } = useI18n();

  return (
    <header className="flex h-11 flex-none items-center bg-canvas px-2">
      {activeView === "chat" &&
      primaryNavigationHidden &&
      !conversationOpen ? (
        <TopBarIconButton
          label={t.workspace.expandPrimaryNavigation}
          onClick={onExpandPrimaryNavigation}
        >
          <PanelLeftOpen />
        </TopBarIconButton>
      ) : null}

      {activeView === "chat" && !conversationOpen ? (
        <>
          {primaryNavigationHidden ? (
            <span
              aria-hidden
              className="mx-1 h-4 w-px flex-none bg-line-subtle"
            />
          ) : null}
          <TopBarIconButton
            label={t.workspace.showConversations}
            onClick={onToggleConversation}
          >
            <PanelLeft />
          </TopBarIconButton>
        </>
      ) : null}

      <div className="flex-1" />

      {sessionSurface && onSessionSurfaceChange ? (
        <div
          aria-label={t.workspace.sessionView}
          className="mr-2 flex items-center rounded-control border border-line-subtle bg-subtle p-0.5"
          role="tablist"
        >
          <SessionSurfaceButton
            active={sessionSurface === "chat"}
            label={t.workspace.sessionChatView}
            onClick={() => onSessionSurfaceChange("chat")}
          >
            <MessageSquare />
          </SessionSurfaceButton>
          <SessionSurfaceButton
            active={sessionSurface === "generation"}
            label={t.workspace.sessionGenerationView}
            onClick={() => onSessionSurfaceChange("generation")}
          >
            <Images />
          </SessionSurfaceButton>
        </div>
      ) : null}

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

function SessionSurfaceButton({
  active,
  children,
  label,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-selected={active}
      className={active
        ? "flex h-7 items-center gap-1.5 rounded-md bg-canvas px-2 text-caption font-medium text-primary shadow-sm [&_svg]:size-3.5"
        : "flex h-7 items-center gap-1.5 rounded-md px-2 text-caption text-muted hover:bg-hover hover:text-primary [&_svg]:size-3.5"}
      onClick={onClick}
      role="tab"
      type="button"
    >
      {children}
      {label}
    </button>
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
