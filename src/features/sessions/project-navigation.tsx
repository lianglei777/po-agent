"use client";

import { useState } from "react";
import { Button, Dropdown, Skeleton, Tooltip } from "antd";
import { Check, Folder, MoreHorizontal, RefreshCw } from "@/components/icons";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  // Dropdown 弹层挂在行外，显式记录打开项，避免焦点离开后操作按钮消失。
  const [openProjectMenu, setOpenProjectMenu] = useState<string | null>(null);

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
          <Tooltip mouseEnterDelay={0.35} title={t.sessions.refreshSessions}>
            <Button
              aria-label={t.sessions.refreshSessions}
              htmlType="button"
              icon={
                navigation.refreshed ? (
                  <Check className="text-success-text" />
                ) : (
                  <RefreshCw />
                )
              }
              onClick={() => void navigation.manualRefresh()}
              size="small"
              type="text"
            />
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
            {["w-full", "w-[88%]", "w-[72%]"].map((width) => (
              <Skeleton.Node
                active
                className={compact ? "mx-auto size-8" : `h-8 ${width}`}
                key={width}
              >
                <span />
              </Skeleton.Node>
            ))}
          </div>
        ) : navigation.error ? (
          compact ? null : (
            <div className="p-3 text-meta text-destructive-text">
              <p>{navigation.error}</p>
              <Button
                className="mt-2"
                htmlType="button"
                onClick={() => void navigation.refresh(true)}
                size="small"
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
                  <Tooltip
                    mouseEnterDelay={0.35}
                    placement="right"
                    title={compact ? name : undefined}
                  >
                    <Button
                      aria-current={selected ? "page" : undefined}
                      className={`h-8 min-w-0 bg-transparent ${
                        compact
                          ? "w-8 justify-center px-0"
                          : "flex-1 justify-start! gap-1.5 px-1 text-meta"
                      }`}
                      htmlType="button"
                      icon={<Folder className="size-3.5 shrink-0" />}
                      onClick={() => navigation.selectProject(project.path)}
                      title={project.path}
                      type="text"
                    >
                      {compact ? null : (
                        <span className="min-w-0 truncate">{name}</span>
                      )}
                    </Button>
                  </Tooltip>
                  {compact ? null : (
                    <div
                      className={`flex w-8 shrink-0 transition-opacity duration-[var(--motion-fast)] group-hover:opacity-100 group-focus-within:opacity-100 ${
                        openProjectMenu === project.path ? "opacity-100" : "opacity-0"
                      }`}
                    >
                      <Dropdown
                        menu={{
                          items: [
                            {
                              disabled:
                                navigation.removingProject === project.path,
                              key: "remove",
                              label: (
                                <div>
                                  <div>{t.sessions.removeProject}</div>
                                  <div className="text-caption text-dim">
                                    {t.sessions.removeProjectDescription}
                                  </div>
                                </div>
                              ),
                              onClick: () =>
                                void navigation.removeProject(project.path),
                            },
                          ],
                        }}
                        onOpenChange={(open) =>
                          setOpenProjectMenu(open ? project.path : null)
                        }
                        open={openProjectMenu === project.path}
                        placement="bottomRight"
                        trigger={["click"]}
                      >
                        <Button
                          aria-label={t.sessions.removeProject}
                          htmlType="button"
                          icon={<MoreHorizontal />}
                          size="small"
                          type="text"
                        />
                      </Dropdown>
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
