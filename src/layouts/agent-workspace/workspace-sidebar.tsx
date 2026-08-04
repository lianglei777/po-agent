import {
  Languages,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ProjectNavigation } from "@/features/sessions/project-navigation";
import type { SessionNavigationController } from "@/features/sessions/use-session-navigation";
import { useI18n } from "@/i18n/use-i18n";
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
  const { locale, setLocale, t } = useI18n();
  const nextLocale = locale === "zh" ? "en" : "zh";

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
          <img
            alt="Po Agent"
            className="size-8 shrink-0"
            src="/po-agent-icon.png"
          />
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={
                compact
                  ? t.workspace.expandPrimaryNavigation
                  : t.workspace.collapsePrimaryNavigation
              }
              onClick={onToggleCompact}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              {compact ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side={compact ? "right" : "bottom"}>
            {compact
              ? t.workspace.expandPrimaryNavigation
              : t.workspace.collapsePrimaryNavigation}
          </TooltipContent>
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
          icon={<Settings />}
          label={t.workspace.settings}
          onClick={onOpenSettings}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={
                nextLocale === "zh"
                  ? t.common.switchToChinese
                  : t.common.switchToEnglish
              }
              className={compact ? "size-5 px-0" : "size-8 px-0"}
              onClick={() => setLocale(nextLocale)}
              type="button"
              variant="ghost"
            >
              <Languages />
            </Button>
          </TooltipTrigger>
          <TooltipContent side={compact ? "right" : "top"}>
            {nextLocale === "zh"
              ? t.common.switchToChinese
              : t.common.switchToEnglish}
          </TooltipContent>
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
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-current={active ? "page" : undefined}
          aria-label={label}
          className={compact ? "size-5 px-0" : "size-8 px-0"}
          onClick={onClick}
          type="button"
          variant={active ? "secondary" : "ghost"}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={compact ? "right" : "top"}>{label}</TooltipContent>
    </Tooltip>
  );
}
