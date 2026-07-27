import {
  FileText,
  Languages,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sparkles,
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
import type { ProjectPanelTab } from "./project-panel";
import type { WorkspaceView } from "./workspace-navigation";

export type WorkspaceSidebarProps = {
  activeProjectTool: ProjectPanelTab;
  activeView: WorkspaceView;
  compact: boolean;
  navigation: SessionNavigationController;
  onOpenFiles: () => void;
  onOpenSettings: () => void;
  onOpenSkills: () => void;
  onToggleCompact: () => void;
  projectPanelOpen: boolean;
};

export function WorkspaceSidebar({
  activeProjectTool,
  activeView,
  compact,
  navigation,
  onOpenFiles,
  onOpenSettings,
  onOpenSkills,
  onToggleCompact,
  projectPanelOpen,
}: WorkspaceSidebarProps) {
  const { locale, setLocale, t } = useI18n();
  const nextLocale = locale === "zh" ? "en" : "zh";
  const projectSelected = Boolean(navigation.selectedCwd);

  return (
    <div
      className={`flex h-full min-h-0 flex-col bg-[var(--sidebar-bg)] ${
        compact ? "px-1.5 py-2.5" : "px-3 py-3"
      }`}
    >
      <div
        className={`mb-2 flex h-9 items-center ${
          compact ? "justify-center" : "gap-2 px-1"
        }`}
      >
        {compact ? null : (
          <img
            alt="Po Agent"
            className="size-8 shrink-0"
            src="/po-agent-icon.png"
          />
        )}
        {compact ? null : (
          <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-[-0.02em] text-primary">
            Po Agent
          </span>
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

      <nav aria-label={t.workspace.projectTools} className="space-y-0.5">
        <ProjectToolButton
          active={
            activeView === "chat" &&
            projectPanelOpen &&
            activeProjectTool === "skills"
          }
          compact={compact}
          disabledReason={
            projectSelected ? null : t.workspace.selectProjectForSkills
          }
          icon={<Sparkles />}
          label={t.workspace.skills}
          onClick={onOpenSkills}
        />
        <ProjectToolButton
          active={
            activeView === "chat" &&
            projectPanelOpen &&
            activeProjectTool === "files"
          }
          compact={compact}
          disabledReason={
            projectSelected ? null : t.workspace.selectProjectForFiles
          }
          icon={<FileText />}
          label={t.files.files}
          onClick={onOpenFiles}
        />
      </nav>

      <div className="my-2.5 h-px bg-line-subtle" />
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

function ProjectToolButton({
  active,
  compact,
  disabledReason,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  compact: boolean;
  disabledReason: string | null;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  const button = (
    <Button
      aria-current={active ? "page" : undefined}
      aria-disabled={disabledReason ? true : undefined}
      className={`w-full ${compact ? "justify-center px-0" : "justify-start"}`}
      onClick={disabledReason ? undefined : onClick}
      size="sm"
      type="button"
      variant={active ? "secondary" : "ghost"}
    >
      {icon}
      {compact ? null : <span className="truncate">{label}</span>}
    </Button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side={compact ? "right" : "top"}>
        {disabledReason ?? label}
      </TooltipContent>
    </Tooltip>
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
