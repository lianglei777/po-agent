"use client";

import { Popover } from "antd";
import type { GenerationInputConstraint, GenerationParameterField, JsonValue } from "@/contracts/generation";
import { Settings2 } from "@/components/icons";
import { generationParameterConflict } from "@/components/generation/generation-input-constraints";
import { GenerationParameterEditor } from "@/components/generation/generation-parameter-editor";
import { useI18n } from "@/i18n/use-i18n";
import { generationSettingsSummary } from "../../model/generation-composer-settings";

export function CanvasGenerationConfig({
  ariaLabel,
  disabled,
  fields,
  constraints = [],
  values,
  onChange,
  getPopupContainer,
}: {
  ariaLabel: string;
  disabled: boolean;
  fields: GenerationParameterField[];
  constraints?: GenerationInputConstraint[];
  values: Record<string, JsonValue>;
  onChange: (values: Record<string, JsonValue>) => void;
  getPopupContainer?: (trigger: HTMLElement) => HTMLElement;
}) {
  const { t } = useI18n();
  const inputLabels = t.contentGeneration.inputs as Readonly<Record<string, string>>;
  const conflict = generationParameterConflict(constraints, values);
  const conflictLabels = conflict?.keys.map((key) => inputLabels[key] ?? key).join(" / ");
  const summary = generationSettingsSummary(fields, values, {
    autoDuration: t.pipeline.generationDurationAuto,
    disabled: t.pipeline.generationDisabled,
    enabled: t.pipeline.generationEnabled,
    fieldLabels: inputLabels,
  });

  if (!fields.length) return null;
  return (
    <Popover
      arrow={false}
      content={(
        <section
          aria-label={ariaLabel}
          className="nodrag max-h-[min(70vh,680px)] w-[min(420px,calc(100vw-48px))] overflow-y-auto p-1 [scrollbar-gutter:stable]"
        >
          <h3 className="sr-only">{ariaLabel}</h3>
          <GenerationParameterEditor disabled={disabled} fields={fields} values={values} onChange={onChange} />
          {conflictLabels ? (
            <p className="mt-4 border-t border-line-subtle pt-3 text-caption text-[var(--pl-danger)]" role="alert">
              {t.pipeline.generationParametersMutuallyExclusive.replace("{fields}", conflictLabels)}
            </p>
          ) : null}
        </section>
      )}
      destroyOnHidden
      getPopupContainer={getPopupContainer}
      placement="topLeft"
      trigger="click"
    >
      <button
        aria-label={ariaLabel}
        className="nodrag flex h-8 min-w-0 items-center gap-1.5 rounded-lg bg-[var(--pl-surface-hover)] px-2 text-xs text-[var(--pl-text-secondary)] transition-colors hover:text-[var(--pl-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)] disabled:opacity-50"
        disabled={disabled}
        type="button"
      >
        <Settings2 className="size-3.5 shrink-0" />
        <span className="max-w-80 truncate">{summary.length ? summary.slice(0, 4).join(" · ") : ariaLabel}</span>
      </button>
    </Popover>
  );
}
