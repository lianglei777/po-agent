"use client";

import { useState } from "react";
import { Input, Select, Typography } from "antd";
import {
  getCompatFields,
  type CompatFieldDefinition,
} from "@/contracts/model-compat";
import { useI18n } from "@/i18n/use-i18n";
import {
  SettingsRow,
  SettingsSection,
} from "@/components/ui/settings-form";
import { changeCompatValue } from "./compat-editor-state";

interface Props {
  api: string | undefined;
  compat: Record<string, unknown> | undefined;
  inheritedCompat?: Record<string, unknown>;
  onChange: (compat: Record<string, unknown> | undefined) => void;
}

export function CompatEditor({
  api,
  compat,
  inheritedCompat,
  onChange,
}: Props) {
  const { t } = useI18n();
  const fields = getCompatFields(api);
  // 字段描述按 `${api}.${fieldKey}` 查字典；类型上以索引签名访问
  const descriptions = t.models.compatFieldDescriptions as Record<
    string,
    string
  >;

  return (
    <SettingsSection title={t.models.compatibility}>
      <p className="px-4 py-3.5 text-meta leading-4 text-dim">
        {fields.length
          ? t.models.compatibilityDescription
          : t.models.compatibilityUnavailable}
      </p>
      {fields.length > 0 && (
        <details className="border-t border-line-subtle">
          <summary className="cursor-pointer px-3 py-2 text-xs text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {t.models.compatibilitySettings} · {api}
          </summary>
          <div className="border-t border-line-subtle">
            {fields.map((field) => (
              <CompatField
                key={field.key}
                field={field}
                description={descriptions[`${api}.${field.key}`]}
                value={compat?.[field.key]}
                inheritedValue={inheritedCompat?.[field.key]}
                onChange={(value) =>
                  onChange(changeCompatValue(compat, field.key, value))
                }
              />
            ))}
          </div>
        </details>
      )}
    </SettingsSection>
  );
}

function CompatField({
  field,
  description,
  value,
  inheritedValue,
  onChange,
}: {
  field: CompatFieldDefinition;
  description?: string;
  value: unknown;
  inheritedValue: unknown;
  onChange: (value: unknown) => void;
}) {
  const { t } = useI18n();
  const inheritedLabel =
    inheritedValue === undefined
      ? t.models.auto
      : `${t.models.inherited}: ${formatValue(inheritedValue)}`;
  const label = <code className="font-ui-mono">{field.key}</code>;

  if (field.kind === "object") {
    return (
      <SettingsRow
        label={label}
        labelFor={`compat-${field.key}`}
        description={description}
        align="start"
        contentMaxWidth={400}
      >
        <JsonCompatTextarea
          ariaLabel={field.key}
          id={`compat-${field.key}`}
          value={value}
          inheritedLabel={inheritedLabel}
          onChange={onChange}
        />
      </SettingsRow>
    );
  }

  // 带显式默认值且无继承上下文（Provider 级）的布尔字段：渲染为二态，
  // 默认值即默认显示，避免 "Auto" 误导（如 supportsDeveloperRole 默认 false）。
  if (
    field.kind === "boolean" &&
    field.defaultValue !== undefined &&
    inheritedValue === undefined
  ) {
    const resolved =
      typeof value === "boolean" ? value : field.defaultValue;
    return (
      <SettingsRow
        label={label}
        labelFor={`compat-${field.key}`}
        description={description}
      >
        <Select
          aria-label={field.key}
          id={`compat-${field.key}`}
          onChange={(value) => onChange(value === "true")}
          options={[
            { label: t.models.enabled, value: "true" },
            { label: t.models.disabled, value: "false" },
          ]}
          value={String(resolved)}
        />
      </SettingsRow>
    );
  }

  return (
    <SettingsRow
      label={label}
      labelFor={`compat-${field.key}`}
      description={description}
    >
      <Select
        aria-label={field.key}
        id={`compat-${field.key}`}
        onChange={(next) => {
          if (!next) onChange(undefined);
          else if (field.kind === "boolean") onChange(next === "true");
          else onChange(next);
        }}
        options={[
          { label: inheritedLabel, value: "" },
          ...(field.kind === "boolean"
            ? [
                { label: t.models.enabled, value: "true" },
                { label: t.models.disabled, value: "false" },
              ]
            : field.values.map((option) => ({ label: option, value: option }))),
        ]}
        value={value === undefined ? "" : String(value)}
      />
    </SettingsRow>
  );
}

function JsonCompatTextarea({
  ariaLabel,
  id,
  value,
  inheritedLabel,
  onChange,
}: {
  ariaLabel: string;
  id: string;
  value: unknown;
  inheritedLabel: string;
  onChange: (value: unknown) => void;
}) {
  const { t } = useI18n();
  const [text, setText] = useState(value ? JSON.stringify(value, null, 2) : "");
  const [invalid, setInvalid] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      <Input.TextArea
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        className="min-h-22 resize-y font-ui-mono"
        size="small"
        status={invalid ? "error" : undefined}
        id={id}
        rows={4}
        value={text}
        placeholder={inheritedLabel}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          if (!next.trim()) {
            setInvalid(false);
            onChange(undefined);
            return;
          }
          try {
            const parsed = JSON.parse(next) as unknown;
            if (
              typeof parsed !== "object" ||
              parsed === null ||
              Array.isArray(parsed)
            ) {
              setInvalid(true);
              return;
            }
            setInvalid(false);
            onChange(parsed);
          } catch {
            setInvalid(true);
          }
        }}
      />
      {invalid && (
        <Typography.Text className="text-meta" type="danger">
          {t.models.invalidJsonObject}
        </Typography.Text>
      )}
    </div>
  );
}

function formatValue(value: unknown) {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value;
  return "JSON";
}
