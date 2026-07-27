"use client";

import { Check, Folder, MoreHorizontal, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useI18n } from "@/i18n/use-i18n";
import { ProjectPicker } from "./project-picker";
import { getProjectName } from "./session-utils";
import type { SessionNavigationController } from "./use-session-navigation";

export function ProjectNavigation({
  compact,
  navigation,
}: {
  compact: boolean;
  navigation: SessionNavigationController;
}) {
  const { t } = useI18n();

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div
        className={`flex h-9 flex-none items-center gap-1 text-meta font-medium text-muted ${
          compact ? "justify-center px-1" : "px-2"
        }`}
      >
        {compact ? null : <span className="min-w-0 flex-1">{t.workspace.projects}</span>}
        <ProjectPicker
          onSelect={async (cwd) => {
            await navigation.refresh();
            navigation.selectProject(cwd);
          }}
        />
        {compact ? null : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={t.sessions.refreshSessions}
                onClick={() => void navigation.manualRefresh()}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                {navigation.refreshed ? (
                  <Check className="text-success-text" />
                ) : (
                  <RefreshCw />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t.sessions.refreshSessions}</TooltipContent>
          </Tooltip>
        )}
      </div>

      {navigation.projectError && !compact ? (
        <p className="px-2 py-1 text-meta text-destructive-text">
          {navigation.projectError}
        </p>
      ) : null}

      <ScrollArea
        className="min-h-0 flex-1"
        viewportClassName="[&>div]:block!"
      >
        {navigation.loading ? (
          <div
            aria-label={t.sessions.loadingSessions}
            className="space-y-2 px-2 py-2"
          >
            <Skeleton className={compact ? "mx-auto size-8" : "h-8 w-full"} />
            <Skeleton className={compact ? "mx-auto size-8" : "h-8 w-[88%]"} />
            <Skeleton className={compact ? "mx-auto size-8" : "h-8 w-[72%]"} />
          </div>
        ) : navigation.error ? (
          compact ? null : (
            <div className="p-3 text-meta text-destructive-text">
              <p>{navigation.error}</p>
              <Button
                className="mt-2"
                onClick={() => void navigation.refresh(true)}
                size="sm"
                variant="outline"
              >
                {t.common.retry}
              </Button>
            </div>
          )
        ) : navigation.projects.length ? (
          <div className={`space-y-0.5 py-1 ${compact ? "px-1" : ""}`}>
            {navigation.projects.map((project) => {
              const selected = project.aliases.includes(
                navigation.selectedCwd ?? "",
              );
              const name = getProjectName(project.path);
              return (
                <div
                  className={`group flex items-center rounded-md transition-colors duration-[var(--motion-fast)] hover:bg-hover focus-within:bg-hover ${
                    selected ? "bg-selected" : ""
                  } ${compact ? "justify-center" : "px-1"}`}
                  key={project.path}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        aria-current={selected ? "page" : undefined}
                        className={`h-8 min-w-0 bg-transparent ${
                          compact
                            ? "w-8 justify-center px-0"
                            : "flex-1 justify-start gap-1.5 px-1 text-meta"
                        }`}
                        onClick={() => navigation.selectProject(project.path)}
                        title={project.path}
                        type="button"
                        variant="ghost"
                      >
                        <Folder className="size-3.5 shrink-0" />
                        {compact ? null : (
                          <span className="min-w-0 truncate">{name}</span>
                        )}
                      </Button>
                    </TooltipTrigger>
                    {compact ? <TooltipContent side="right">{name}</TooltipContent> : null}
                  </Tooltip>
                  {compact ? null : (
                    <div className="hidden group-hover:flex group-focus-within:flex has-[[data-state=open]]:flex">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            aria-label={t.sessions.removeProject}
                            size="icon-sm"
                            type="button"
                            variant="ghost"
                          >
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem
                            disabled={
                              navigation.removingProject === project.path
                            }
                            onSelect={() =>
                              void navigation.removeProject(project.path)
                            }
                          >
                            <div>
                              <div>{t.sessions.removeProject}</div>
                              <div className="text-caption text-dim">
                                {t.sessions.removeProjectDescription}
                              </div>
                            </div>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : compact ? null : (
          <div className="space-y-2 p-4 text-center text-meta text-dim">
            <p>{t.sessions.noProjects}</p>
            <ProjectPicker
              onSelect={async (cwd) => {
                await navigation.refresh();
                navigation.selectProject(cwd);
              }}
              trigger="button"
            />
          </div>
        )}
      </ScrollArea>
    </section>
  );
}
