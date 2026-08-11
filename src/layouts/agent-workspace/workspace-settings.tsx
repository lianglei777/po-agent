"use client";

import { ArrowLeft, Cpu, Images, ScrollText, Settings } from "@/components/icons";
import { useState } from "react";
import { Button, Segmented, Switch } from "antd";
import {
  ModelProviderPage,
  type ModelProviderSaveStatus,
} from "@/features/model-providers/model-provider-page";
import { SystemPromptWorkbench } from "@/features/instructions/system-prompt-workbench";
import { useI18n } from "@/i18n/use-i18n";
import { ContentGenerationSettings } from "@/features/content-generation/content-generation-settings";
import { useAgentSettings } from "@/features/agent-settings/use-agent-settings";
import { ModelProviderSaveIndicator } from "./model-provider-save-indicator";

type SettingsSection = "models" | "content-generation" | "instructions" | "general";

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
  onModelsSaved: () => void;
  onOpenProjectInstructions: () => void;
  onSystemPromptChange: (prompt: string) => void;
  onSystemPromptDirtyChange: (dirty: boolean) => void;
}) {
  const [section, setSection] = useState<SettingsSection>("general");
  const [modelProviderSaveStatus, setModelProviderSaveStatus] =
    useState<ModelProviderSaveStatus>({ phase: "idle" });
  const { locale, setLocale, t } = useI18n();
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
          icon={<Cpu />}
          label={t.workspace.modelProvider}
          onClick={() => setSection("models")}
          selected={section === "models"}
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
              section === "models" ? "flex min-h-0 min-w-0 flex-1" : "hidden"
            }
          >
            <ModelProviderPage
              onDirtyChange={onModelDirtyChange}
              onSaved={onModelsSaved}
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
              <div className="space-y-8">
                <SettingsRow
                  description={t.settings.languageDescription}
                  label={t.common.language}
                >
                  <Segmented
                    onChange={setLocale}
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
                >
                  <div className="flex flex-col items-end">
                    <Switch
                      checked={agentSettings.autoCompactionEnabled}
                      className="custom-switch"
                      disabled={agentSettings.loading || agentSettings.saving}
                      loading={agentSettings.loading || agentSettings.saving}
                      onChange={(checked) =>
                        void agentSettings.setAutoCompaction(checked)
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
        <section className="py-6">{children}</section>
      </div>
    </main>
  );
}

function SettingsRow({
  children,
  description,
  label,
}: {
  children: React.ReactNode;
  description: string;
  label: string;
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-primary">{label}</p>
        <p className="mt-1 max-w-[55ch] text-body-sm leading-6 text-muted">
          {description}
        </p>
      </div>
      <div className="flex shrink-0 items-center pt-0.5">{children}</div>
    </div>
  );
}
