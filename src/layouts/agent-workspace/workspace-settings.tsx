"use client";

import { ArrowLeft, Cpu, Languages, ScrollText } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ModelProviderPage,
  type ModelProviderSaveStatus,
} from "@/features/model-providers/model-provider-page";
import { SystemPromptWorkbench } from "@/features/instructions/system-prompt-workbench";
import { useI18n } from "@/i18n/use-i18n";
import { mergeClasses } from "@/lib/utils";
import { ModelProviderSaveIndicator } from "./model-provider-save-indicator";

type SettingsSection = "models" | "instructions" | "language";

export function WorkspaceSettings({
  agentId,
  currentSystemPrompt,
  cwd,
  instructionsNeedApply,
  isRunning,
  modelProviderSaveStatus,
  onBack,
  onInstructionsApplied,
  onInstructionsChanged,
  onModelDirtyChange,
  onModelsSaved,
  onModelSaveStatusChange,
  onOpenProjectInstructions,
  onSystemPromptChange,
  onSystemPromptDirtyChange,
}: {
  agentId?: string;
  currentSystemPrompt?: string | null;
  cwd?: string;
  instructionsNeedApply?: boolean;
  isRunning?: boolean;
  modelProviderSaveStatus?: ModelProviderSaveStatus;
  onBack: () => void;
  onInstructionsApplied: () => void;
  onInstructionsChanged: () => void;
  onModelDirtyChange: (dirty: boolean) => void;
  onModelsSaved: () => void;
  onModelSaveStatusChange: (status: ModelProviderSaveStatus) => void;
  onOpenProjectInstructions: () => void;
  onSystemPromptChange: (prompt: string) => void;
  onSystemPromptDirtyChange: (dirty: boolean) => void;
}) {
  const [section, setSection] = useState<SettingsSection>("models");
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="flex h-full min-h-0 bg-[var(--workspace-bg)]">
      <aside
        aria-label={t.workspace.settings}
        className="flex w-60 shrink-0 flex-col px-4 py-3"
      >
        <Button
          className="h-9 justify-start px-2 text-muted"
          onClick={onBack}
          type="button"
          variant="ghost"
        >
          <ArrowLeft />
          {t.settings.exitSettings}
        </Button>

        <p className="mt-7 px-2 pb-2 text-caption font-medium text-dim">
          {t.workspace.settings}
        </p>
        <SettingsNavButton
          icon={<Cpu />}
          label={t.workspace.modelProvider}
          onClick={() => setSection("models")}
          selected={section === "models"}
        />
        <SettingsNavButton
          icon={<ScrollText />}
          label={t.workspace.systemPrompt}
          onClick={() => setSection("instructions")}
          selected={section === "instructions"}
        />
        <SettingsNavButton
          icon={<Languages />}
          label={t.common.language}
          onClick={() => setSection("language")}
          selected={section === "language"}
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
              onSaveStatusChange={onModelSaveStatusChange}
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

          {section === "language" ? (
            <SettingsReadingColumn
              description={t.settings.languageDescription}
              title={t.common.language}
            >
              <div className="inline-flex rounded-lg border border-line-subtle bg-subtle p-1">
                <Button
                  onClick={() => setLocale("zh")}
                  size="sm"
                  type="button"
                  variant={locale === "zh" ? "secondary" : "ghost"}
                >
                  中文
                </Button>
                <Button
                  onClick={() => setLocale("en")}
                  size="sm"
                  type="button"
                  variant={locale === "en" ? "secondary" : "ghost"}
                >
                  English
                </Button>
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
    <button
      aria-current={selected ? "page" : undefined}
      className={mergeClasses(
        "flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs font-medium text-primary outline-none transition-colors duration-[var(--motion-fast)] hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring",
        selected && "bg-selected",
      )}
      onClick={onClick}
      type="button"
    >
      <span className="text-muted [&_svg]:size-3.5">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
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
