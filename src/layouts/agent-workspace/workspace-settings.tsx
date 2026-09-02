"use client";

import {
  ArrowLeft,
  Cpu,
  Globe,
  Images,
  Lock,
  ScrollText,
  Settings,
} from "@/components/icons";
import { useState } from "react";
import { App, Button, Segmented, Switch } from "antd";
import {
  ModelProviderPage,
  type ModelProviderSaveStatus,
} from "@/features/model-providers/model-provider-page";
import { SystemPromptWorkbench } from "@/features/instructions/system-prompt-workbench";
import { useI18n } from "@/i18n/use-i18n";
import { ContentGenerationSettings } from "@/features/content-generation/content-generation-settings";
import { useAgentSettings } from "@/features/agent-settings/use-agent-settings";
import { WebAccessSettings } from "@/features/web-access/web-access-settings";
import { AccessControlSettings } from "@/features/access-control/access-control-settings";
import { ModelProviderSaveIndicator } from "./model-provider-save-indicator";
import { SettingsRow } from "@/components/ui/settings-form";

type SettingsSection =
  | "models"
  | "web-access"
  | "content-generation"
  | "instructions"
  | "security"
  | "general";

export function WorkspaceSettings({
  agentId,
  currentSystemPrompt,
  cwd,
  instructionsNeedApply,
  isRunning,
  onBack,
  onInstructionsApplied,
  onInstructionsChanged,
  onContentGenerationDirtyChange,
  onModelDirtyChange,
  onWebAccessDirtyChange,
  onModelsSaved,
  onOpenProjectInstructions,
  onSystemPromptChange,
  onSystemPromptDirtyChange,
}: {
  agentId?: string;
  currentSystemPrompt?: string | null;
  cwd?: string;
  instructionsNeedApply?: boolean;
  isRunning?: boolean;
  onBack: () => void;
  onInstructionsApplied: () => void;
  onInstructionsChanged: () => void;
  onContentGenerationDirtyChange: (dirty: boolean) => void;
  onModelDirtyChange: (dirty: boolean) => void;
  onWebAccessDirtyChange: (dirty: boolean) => void;
  onModelsSaved: () => void;
  onOpenProjectInstructions: () => void;
  onSystemPromptChange: (prompt: string) => void;
  onSystemPromptDirtyChange: (dirty: boolean) => void;
}) {
  const [section, setSection] = useState<SettingsSection>("general");
  const [modelProviderSaveStatus, setModelProviderSaveStatus] =
    useState<ModelProviderSaveStatus>({ phase: "idle" });
  const { locale, setLocale, t } = useI18n();
  const { message } = App.useApp();
  const agentSettings = useAgentSettings();

  return (
    <div className="flex h-full min-h-0 bg-[var(--workspace-bg)]">
      <aside
        aria-label={t.workspace.settings}
        className="flex w-60 shrink-0 flex-col px-4 py-3"
      >
        <Button
          block
          className="h-9 justify-start! px-2 text-muted"
          htmlType="button"
          icon={<ArrowLeft />}
          onClick={onBack}
          type="text"
        >
          {t.settings.exitSettings}
        </Button>

        <p className="mt-7 px-2 pb-2 text-caption font-medium text-dim">
          {t.workspace.settings}
        </p>
        <SettingsNavButton
          icon={<Settings />}
          label={t.settings.general}
          onClick={() => setSection("general")}
          selected={section === "general"}
        />
        <SettingsNavButton
          icon={<Lock />}
          label={t.accessControl.settingsTitle}
          onClick={() => setSection("security")}
          selected={section === "security"}
        />
        <SettingsNavButton
          icon={<Cpu />}
          label={t.workspace.modelProvider}
          onClick={() => setSection("models")}
          selected={section === "models"}
        />
        <SettingsNavButton
          icon={<Globe />}
          label={t.webAccess.title}
          onClick={() => setSection("web-access")}
          selected={section === "web-access"}
        />
        <SettingsNavButton
          icon={<Images />}
          label={t.contentGeneration.title}
          onClick={() => setSection("content-generation")}
          selected={section === "content-generation"}
        />
        <SettingsNavButton
          icon={<ScrollText />}
          label={t.workspace.systemPrompt}
          onClick={() => setSection("instructions")}
          selected={section === "instructions"}
        />
      </aside>

      <section className="my-3 mr-3 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-canvas">
        <header className="flex h-12 flex-none items-center border-b border-line-subtle px-5">
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-primary">
            {t.workspace.settings}
          </h1>
          <ModelProviderSaveIndicator
            className="ml-3"
            status={modelProviderSaveStatus}
          />
        </header>

        <div className="flex min-h-0 min-w-0 flex-1">
          <div
            className={
              section === "security"
                ? "flex min-h-0 min-w-0 flex-1"
                : "hidden"
            }
          >
            <AccessControlSettings />
          </div>

          <div
            className={
              section === "web-access"
                ? "flex min-h-0 min-w-0 flex-1"
                : "hidden"
            }
          >
            <WebAccessSettings onDirtyChange={onWebAccessDirtyChange} />
          </div>

          <div
            className={
              section === "models" ? "flex min-h-0 min-w-0 flex-1" : "hidden"
            }
          >
            <ModelProviderPage
              onDirtyChange={onModelDirtyChange}
              onSaved={() => {
                onModelsSaved();
                void message.success(t.common.settingsSaved);
              }}
              onSaveStatusChange={setModelProviderSaveStatus}
            />
          </div>

          <div
            className={
              section === "content-generation"
                ? "flex min-h-0 min-w-0 flex-1"
                : "hidden"
            }
          >
            <ContentGenerationSettings
              onDirtyChange={onContentGenerationDirtyChange}
            />
          </div>

          <div
            className={
              section === "instructions"
                ? "flex min-h-0 min-w-0 flex-1"
                : "hidden"
            }
          >
            <SystemPromptWorkbench
              agentId={agentId}
              currentSystemPrompt={currentSystemPrompt}
              cwd={cwd}
              isRunning={isRunning}
              needsApply={instructionsNeedApply}
              onApplied={onInstructionsApplied}
              onDirtyChange={onSystemPromptDirtyChange}
              onInstructionsChanged={onInstructionsChanged}
              onOpenProjectInstructions={onOpenProjectInstructions}
              onSystemPromptChange={onSystemPromptChange}
            />
          </div>

          {section === "general" ? (
            <SettingsReadingColumn
              description={t.settings.generalDescription}
              title={t.settings.general}
            >
              <div className="overflow-hidden rounded-floating border border-line-subtle bg-panel">
                <SettingsRow
                  description={t.settings.languageDescription}
                  label={t.common.language}
                  contentMaxWidth={220}
                >
                  <Segmented
                    onChange={(nextLocale) => {
                      setLocale(nextLocale);
                      void message.success(t.common.settingsSaved);
                    }}
                    options={[
                      { label: "中文", value: "zh" as const },
                      { label: "English", value: "en" as const },
                    ]}
                    size="small"
                    value={locale}
                  />
                </SettingsRow>
                <SettingsRow
                  description={t.settings.autoCompactDescription}
                  label={t.settings.autoCompact}
                  contentMaxWidth={220}
                >
                  <div className="flex flex-col items-end">
                    <Switch
                      checked={agentSettings.autoCompactionEnabled}
                      className="custom-switch"
                      disabled={agentSettings.loading || agentSettings.saving}
                      loading={agentSettings.loading || agentSettings.saving}
                      onChange={(checked) =>
                        void agentSettings
                          .setAutoCompaction(checked)
                          .then((saved) => {
                            if (saved) {
                              void message.success(t.common.settingsSaved);
                            }
                          })
                      }
                      size="small"
                    />
                    {agentSettings.error ? (
                      <p
                        className="mt-2 max-w-56 text-right text-xs text-destructive-text"
                        role="alert"
                      >
                        {agentSettings.error === "load"
                          ? t.settings.autoCompactLoadError
                          : t.settings.autoCompactSaveError}
                      </p>
                    ) : null}
                  </div>
                </SettingsRow>
              </div>
            </SettingsReadingColumn>
          ) : null}
        </div>
      </section>
    </div>
  );
}
function SettingsNavButton({
  icon,
  label,
  onClick,
  selected,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  selected: boolean;
}) {
  return (
    <Button
      aria-current={selected ? "page" : undefined}
      block
      className="h-9 justify-start! px-2 text-left text-xs font-medium"
      color={selected ? "primary" : "default"}
      htmlType="button"
      icon={<span className="text-muted [&_svg]:size-3.5">{icon}</span>}
      onClick={onClick}
      variant={selected ? "filled" : "text"}
    >
      <span className="truncate">{label}</span>
    </Button>
  );
}
function SettingsReadingColumn({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <main className="min-w-0 flex-1 overflow-y-auto px-10 py-8">
      <div className="mx-auto max-w-4xl">
        <header className="border-b border-line-subtle pb-5">
          <h1 className="text-lg font-semibold tracking-[-0.02em] text-primary">
            {title}
          </h1>
          <p className="mt-1 max-w-[65ch] text-body-sm leading-6 text-muted">
            {description}
          </p>
        </header>
        <section className="py-5">{children}</section>
      </div>
    </main>
  );
}
