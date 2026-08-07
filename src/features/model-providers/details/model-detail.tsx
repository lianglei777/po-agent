"use client";

import { useState, useCallback, useMemo } from "react";
import { Button, Input, Select, Switch } from "antd";
import { testModelConfig } from "../api";
import { getEffectiveApi } from "@/contracts/model-compat";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  API_OPTIONS,
  type ConfiguredThinkingLevel,
  type ModelEntry,
  type ModelsJson,
  type ModelTestState,
  type ModelDiagnostic,
} from "../types";
import { useI18n } from "@/i18n/use-i18n";
import {
  SectionTitle,
  SettingsRow,
  SettingsSection,
} from "@/components/ui/settings-form";
import {
  getDefaultThinkingOnLevel,
  getSupportedConfiguredThinkingLevels,
  isReasoningCapabilityEnabled,
} from "./model-detail-state";
import { CompatEditor } from "./compat-editor";
import {
  applyModelDiagnosticPatch,
  changeEntryApi,
} from "./compat-editor-state";

interface Props {
  providerName: string;
  config: ModelsJson;
  model: ModelEntry;
  onChange: (m: ModelEntry) => void;
  onDelete: () => void;
}

export default function ModelDetail({
  providerName,
  config,
  model,
  onChange,
  onDelete,
}: Props) {
  const [testState, setTestState] = useState<ModelTestState>({ phase: "idle" });
  const [testedConfig, setTestedConfig] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { t } = useI18n();
  const currentConfig = JSON.stringify({ providerName, config, model });
  const visibleTestState = useMemo<ModelTestState>(
    () =>
      testedConfig === currentConfig
        ? testState
        : testedConfig
          ? { phase: "stale" }
          : { phase: "idle" },
    [currentConfig, testState, testedConfig],
  );
  const provider = config.providers?.[providerName];
  const effectiveApi = getEffectiveApi(provider?.api, model.api);
  const hasImageInput = model.input?.includes("image") ?? false;
  const supportedThinkingLevels = getSupportedConfiguredThinkingLevels(model);
  const defaultThinkingLevel = getDefaultThinkingOnLevel(model);
  const reasoningEnabled = isReasoningCapabilityEnabled(model);

  const runTest = useCallback(async (
    testConfig: ModelsJson,
    testModel: ModelEntry,
  ) => {
    if (!testModel.id.trim()) return;
    const fingerprint = JSON.stringify({
      providerName,
      config: testConfig,
      model: testModel,
    });
    setTestedConfig(fingerprint);
    setTestState({ phase: "testing" });
    try {
      const result = await testModelConfig({
        provider: providerName,
        modelId: testModel.id.trim(),
        config: testConfig,
        timeoutMs: 15_000,
      });
      if (!result.ok) {
        setTestState({
          phase: "error",
          message:
            result.diagnostic?.summary ??
            result.error ??
            t.models.modelTestFailed,
          latencyMs: result.latencyMs,
          diagnostic: result.diagnostic,
          checkedAt: result.verification.checkedAt,
        });
      } else {
        setTestState({
          phase: "success",
          latencyMs: result.latencyMs,
          responseText: result.responseText,
          checkedAt: result.verification.checkedAt,
        });
      }
    } catch (e) {
      setTestState({
        phase: "error",
        message: e instanceof Error ? e.message : t.models.unknownError,
      });
    }
  }, [
    providerName,
    t.models.modelTestFailed,
    t.models.unknownError,
  ]);

  const handleTest = useCallback(async () => {
    if (!model.id.trim() || visibleTestState.phase === "testing") return;
    await runTest(config, model);
  }, [config, model, runTest, visibleTestState.phase]);

  const applySuggestionAndRetest = useCallback(async () => {
    const diagnostic =
      visibleTestState.phase === "error"
        ? visibleTestState.diagnostic
        : undefined;
    const patch = diagnostic?.suggestedPatch;
    if (!patch) return;
    const nextModel = applyModelDiagnosticPatch(model, effectiveApi, patch);
    if (nextModel === model) return;
    const nextConfig: ModelsJson = {
      ...config,
      providers: {
        ...(config.providers ?? {}),
        [providerName]: {
          ...provider,
          models: (provider?.models ?? []).map((candidate) =>
            candidate === model ? nextModel : candidate,
          ),
        },
      },
    };
    onChange(nextModel);
    await runTest(nextConfig, nextModel);
  }, [
    config,
    effectiveApi,
    model,
    onChange,
    provider,
    providerName,
    runTest,
    visibleTestState,
  ]);

  const copyModelId = useCallback(async () => {
    if (!model.id) return;
    await navigator.clipboard?.writeText(model.id);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }, [model.id]);

  let testSummary: string | null = null;
  let testBorderColor = "var(--border)";
  let testBgColor = "var(--bg-panel)";

  if (visibleTestState.phase === "testing") {
    testSummary = t.models.testingConnection;
  } else if (visibleTestState.phase === "stale") {
    testSummary = t.models.stale;
  } else if (visibleTestState.phase === "success") {
    testSummary = `${t.models.connected} | ${visibleTestState.latencyMs ?? "?"}ms${
      visibleTestState.responseText ? ` | ${visibleTestState.responseText}` : ""
    }`;
    testBorderColor = "rgba(22,163,74,0.25)";
    testBgColor = "rgba(22,163,74,0.08)";
  } else if (visibleTestState.phase === "error") {
    testSummary = `${t.models.failed} | ${visibleTestState.latencyMs ?? "?"}ms | ${visibleTestState.message}`;
    testBorderColor = "rgba(220,38,38,0.25)";
    testBgColor = "rgba(220,38,38,0.08)";
  }

  return (
    <div className="mx-auto flex w-full max-w-[920px] flex-col gap-6 pb-6">
      <header>
        <SectionTitle>
          {t.models.model} · {providerName}
        </SectionTitle>
        <h1 className="mt-1 truncate font-ui-mono text-lg font-semibold text-primary">
          {model.name || model.id}
        </h1>
      </header>

      <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <DialogContent
          className="z-[1101] sm:max-w-[420px]"
          closeLabel={t.common.close}
          overlayClassName="z-[1100]"
        >
          <DialogHeader>
            <DialogTitle>{t.models.removeModelTitle}</DialogTitle>
            <DialogDescription>
              {t.models.removeModelDescription.replace(
                "{model}",
                model.name || model.id,
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              autoFocus
              htmlType="button"
              onClick={() => setConfirmingDelete(false)}
            >
              {t.common.cancel}
            </Button>
            <Button
              danger
              htmlType="button"
              type="primary"
              onClick={() => {
                setConfirmingDelete(false);
                onDelete();
              }}
            >
              {t.models.removeModelAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {visibleTestState.phase === "error" &&
        visibleTestState.diagnostic && (
          <DiagnosticPanel
            diagnostic={visibleTestState.diagnostic}
            onApplyAndRetest={() => void applySuggestionAndRetest()}
          />
        )}

      <SettingsSection title={t.models.general}>
        <SettingsRow label={t.models.id}>
          <div
            className="flex min-h-8 items-center gap-2 rounded border px-2.5 text-xs"
            style={{
              background: "var(--bg-subtle)",
              borderColor: "var(--border-strong)",
              color: "var(--text)",
            }}
          >
            <span className="min-w-0 flex-1 truncate font-ui-mono">
              {model.id}
            </span>
            <Button
              type="text"
              size="small"
              disabled={!model.id}
              onClick={() => void copyModelId()}
              htmlType="button"
            >
              {copied ? t.models.copied : t.models.copyId}
            </Button>
          </div>
        </SettingsRow>
        <SettingsRow label={t.models.name} labelFor="model-name">
          <Input
            size="small"
            id="model-name"
            value={model.name ?? ""}
            onChange={(e) =>
              onChange({
                ...model,
                name: e.target.value || undefined,
              })
            }
          />
        </SettingsRow>
        <SettingsRow
          label={t.models.testConnectivity}
          description={t.models.realRequestCostNotice}
        >
          <div className="flex items-center justify-end gap-2">
            {testSummary && (
              <span
                title={testSummary}
                className="inline-flex h-6 max-w-[160px] items-center overflow-hidden text-ellipsis whitespace-nowrap rounded border px-2 text-meta"
                style={{
                  borderColor: testBorderColor,
                  background: testBgColor,
                  color: "var(--text)",
                  boxSizing: "border-box",
                }}
              >
                {testSummary}
              </span>
            )}
            <Button
              htmlType="button"
              className="min-w-[80px] justify-center"
              onClick={handleTest}
              disabled={!model.id.trim() || visibleTestState.phase === "testing"}
              size="small"
            >
              {visibleTestState.phase === "success" && <CheckIcon />}
              {visibleTestState.phase === "testing"
                ? t.models.testing
                : visibleTestState.phase === "success"
                  ? t.models.ok
                  : t.models.test}
            </Button>
          </div>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title={t.models.capabilities}>
        <SettingsRow label={t.models.imageInput}>
          <CapabilityToggle
            checked={hasImageInput}
            label={t.models.imageInput}
            onChange={(checked) =>
              onChange({
                ...model,
                input: checked ? ["text", "image"] : ["text"],
              })
            }
          />
        </SettingsRow>
        <SettingsRow label={t.models.reasoningThinking}>
          <CapabilityToggle
            checked={reasoningEnabled}
            label={t.models.reasoningThinking}
            onChange={(checked) =>
              onChange({
                ...model,
                reasoning: checked,
                thinkingDefaultLevel: checked
                  ? (model.thinkingDefaultLevel ??
                    defaultThinkingLevel ??
                    "high")
                  : undefined,
              })
            }
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title={t.models.advanced}>
        <SettingsRow
          label={t.models.apiProtocol}
          labelFor="model-api-protocol"
          description={t.models.apiProtocolDescription}
        >
          <Select
            className={model.api ? "text-primary" : "text-dim"}
            id="model-api-protocol"
            onChange={(value) =>
              onChange(changeEntryApi(model, value || undefined))
            }
            options={[
              { label: t.models.inheritNone, value: "" },
              ...API_OPTIONS.map((option) => ({ label: option, value: option })),
            ]}
            value={model.api ?? ""}
          />
        </SettingsRow>

        {reasoningEnabled && supportedThinkingLevels.length > 0 && (
          <SettingsRow
            label={t.models.thinkingOnDefault}
            labelFor="model-thinking-default"
            description={t.models.thinkingOnDefaultDescription}
          >
            <Select
              id="model-thinking-default"
              onChange={(value) =>
                onChange({
                  ...model,
                  thinkingDefaultLevel: value as ConfiguredThinkingLevel,
                })
              }
              options={supportedThinkingLevels.map((level) => ({
                label: level,
                value: level,
              }))}
              value={model.thinkingDefaultLevel ?? defaultThinkingLevel ?? "high"}
            />
          </SettingsRow>
        )}
      </SettingsSection>

      <CompatEditor
        api={effectiveApi}
        compat={model.compat}
        inheritedCompat={provider?.compat}
        onChange={(compat) => onChange({ ...model, compat })}
      />

      <SettingsSection title={t.models.dangerZone}>
        <SettingsRow
          label={t.common.delete}
          description={t.models.deleteModelDescription}
        >
          <div className="flex justify-end">
            <Button
              danger
              htmlType="button"
              onClick={() => setConfirmingDelete(true)}
              size="small"
              type="primary"
            >
              {t.common.delete}
            </Button>
          </div>
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}

function DiagnosticPanel({
  diagnostic,
  onApplyAndRetest,
}: {
  diagnostic: ModelDiagnostic;
  onApplyAndRetest: () => void;
}) {
  const { t } = useI18n();
  return (
    <section
      aria-live="polite"
      className="rounded-lg border p-3"
      style={{
        borderColor: "rgba(220,38,38,0.25)",
        background: "rgba(220,38,38,0.06)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-ui-mono text-meta text-destructive-text">
            {diagnostic.code}
          </div>
          <p className="mt-1 text-xs leading-5 text-primary">
            {diagnostic.summary}
          </p>
        </div>
        {diagnostic.suggestedPatch && (
          <Button
            htmlType="button"
            size="small"
            className="shrink-0"
            onClick={onApplyAndRetest}
          >
            {t.models.applySuggestionAndRetest}
          </Button>
        )}
      </div>
      {diagnostic.suggestedPatch && (
        <div className="mt-2 rounded border border-line bg-panel p-2">
          <div className="text-meta font-medium text-muted">
            {t.models.suggestedChange}
          </div>
          <pre className="mt-1 overflow-x-auto font-ui-mono text-meta leading-4 text-primary">
            {JSON.stringify(diagnostic.suggestedPatch.changes, null, 2)}
          </pre>
          <p className="mt-1 text-meta leading-4 text-dim">
            {diagnostic.suggestedPatch.reason}
          </p>
        </div>
      )}
      {diagnostic.technicalMessage && (
        <details className="mt-2">
          <summary className="cursor-pointer text-meta text-muted">
            {t.models.diagnosticDetails}
          </summary>
          <pre className="mt-1 max-h-36 overflow-auto whitespace-pre-wrap break-words rounded border border-line bg-panel p-2 font-ui-mono text-meta leading-4 text-muted">
            {diagnostic.technicalMessage}
          </pre>
        </details>
      )}
    </section>
  );
}

function CapabilityToggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2.5">
      <Switch
        aria-label={label}
        checked={checked}
        onChange={onChange}
      />
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
