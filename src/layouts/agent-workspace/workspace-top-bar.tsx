import { Images, MessageSquare, PanelLeft, PanelLeftOpen } from "@/components/icons";
import { Button, Segmented, Tooltip } from "antd";
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
        <Segmented
          aria-label={t.workspace.sessionView}
          className="mr-2"
          onChange={(value) => onSessionSurfaceChange(value)}
          options={[
            {
              icon: <MessageSquare />,
              label: t.workspace.sessionChatView,
              value: "chat" as const,
            },
            {
              icon: <Images />,
              label: t.workspace.sessionGenerationView,
              value: "generation" as const,
            },
          ]}
          size="small"
          value={sessionSurface}
        />
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
    <Tooltip mouseEnterDelay={0.35} placement="bottom" title={label}>
      <Button
        aria-label={label}
        className="text-muted"
        htmlType="button"
        icon={children}
        onClick={onClick}
        size="small"
        type="text"
      />
    </Tooltip>
  );
}
