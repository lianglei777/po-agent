import {
  Film,
  PanelLeftClose,
  Settings,
} from "@/components/icons";
import Image from "next/image";
import { Button, Tooltip } from "antd";
import packageJson from "../../../package.json";
import { ProjectNavigation } from "@/features/sessions/project-navigation";
import type { SessionNavigationController } from "@/features/sessions/use-session-navigation";
import { useI18n } from "@/i18n/use-i18n";
import { useWorkspaceMode } from "@/layouts/workspace-mode-state";
import type { WorkspaceView } from "./workspace-navigation";

export type WorkspaceSidebarProps = {
  activeView: WorkspaceView;
  compact: boolean;
  navigation: SessionNavigationController;
  onOpenSettings: () => void;
  onToggleCompact: () => void;
};

export function WorkspaceSidebar({
  activeView,
  compact,
  navigation,
  onOpenSettings,
  onToggleCompact,
}: WorkspaceSidebarProps) {
  const { t } = useI18n();
  const setMode = useWorkspaceMode((s) => s.setMode);

  return (
    <div
      className={`flex h-full min-h-0 flex-col bg-[var(--sidebar-bg)] ${
        compact ? "px-1.5 py-2.5" : "px-3 py-3"
      }`}
    >
      <div
        className={`mb-2 flex h-9 items-center ${
          compact ? "justify-center" : "justify-between pl-3 pr-1"
        }`}
      >
        {compact ? null : (
          <div className="flex min-w-0 items-center gap-2">
            <Image
              alt="Po Agent"
              className="size-8 shrink-0"
              height={32}
              src="/po-agent-icon.png"
              width={32}
            />
            <span className="font-ui-mono text-caption text-muted">
              v{packageJson.version}
            </span>
          </div>
        )}
        <Tooltip
          mouseEnterDelay={0.35}
          placement={compact ? "right" : "bottom"}
          title={t.workspace.collapsePrimaryNavigation}
        >
          <Button
            aria-label={t.workspace.collapsePrimaryNavigation}
            htmlType="button"
            icon={<PanelLeftClose />}
            onClick={onToggleCompact}
            size="small"
            type="text"
          />
        </Tooltip>
      </div>

      <ProjectNavigation compact={compact} navigation={navigation} />

      <div
        className={`mt-auto flex items-center border-t border-line-strong pt-2.5 ${
          compact ? "justify-center gap-1" : "gap-1"
        }`}
      >
        <SidebarIconAction
          active={activeView === "model-provider"}
          compact={compact}
          icon={<Settings className="size-4" />}
          label={t.workspace.settings}
          onClick={onOpenSettings}
        />
        <Tooltip
          mouseEnterDelay={0.35}
          placement={compact ? "right" : "top"}
          title={t.pipeline.enterPipeline}
        >
          <Button
            aria-label={t.pipeline.enterPipeline}
            className={
              compact
                ? "size-6! shrink-0! p-0!"
                : "size-8! shrink-0! p-0!"
            }
            htmlType="button"
            icon={<Film className="size-4" />}
            onClick={() => setMode("pipeline")}
            size="small"
            type="text"
          />
        </Tooltip>
      </div>
    </div>
  );
}

function SidebarIconAction({
  active = false,
  compact,
  icon,
  label,
  onClick,
}: {
  active?: boolean;
  compact: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip
      mouseEnterDelay={0.35}
      placement={compact ? "right" : "top"}
      title={label}
    >
      <Button
        aria-current={active ? "page" : undefined}
        aria-label={label}
        className={
          compact
            ? "size-6! shrink-0! p-0!"
            : "size-8! shrink-0! p-0!"
        }
        color={active ? "primary" : "default"}
        htmlType="button"
        icon={icon}
        onClick={onClick}
        size="small"
        variant={active ? "filled" : "text"}
      />
    </Tooltip>
  );
}
