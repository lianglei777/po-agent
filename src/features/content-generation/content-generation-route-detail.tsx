"use client";

import { Button, Switch, Tooltip } from "antd";
import { GenerationRouteTags } from "@/components/generation/generation-route-presentation";
import { CheckCircle2 } from "@/components/icons";
import { SettingsRow, SettingsSection } from "@/components/ui/settings-form";
import type {
  GenerationAssetSlot,
  GenerationParameterField,
  GenerationProviderDescriptorDto,
  GenerationRouteDto,
  JsonValue,
} from "@/contracts/generation";
import { useI18n } from "@/i18n/use-i18n";

type Labels = ReturnType<typeof useI18n>["t"]["contentGeneration"];

export function ContentGenerationRouteDetail({
  makeDefault,
  onOpenProvider,
  onToggle,
  provider,
  route,
  updatingDefault,
  updatingRoute,
}: {
  makeDefault: () => void;
  onOpenProvider: () => void;
  onToggle: (enabled: boolean) => void;
  provider: GenerationProviderDescriptorDto;
  route: GenerationRouteDto;
  updatingDefault: boolean;
  updatingRoute: boolean;
}) {
  const { t } = useI18n();
  const labels = t.contentGeneration;
  const capability = capabilityLabel(route.capability, labels);
  const disabledReason = !provider.enabled
    ? format(labels.enableProviderFirst, provider.displayName)
    : undefined;
  const defaultDisabledReason = disabledReason ?? (!route.enabled ? labels.enableRouteFirst : undefined);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-6 py-6">
      <header className="border-b border-line-subtle pb-5">
        <div className="flex items-start justify-between gap-8">
          <div className="min-w-0">
            <p className="text-caption font-medium text-dim">{provider.displayName} / {route.product}</p>
            <h2 className="mt-1 text-lg font-semibold text-primary">{route.name}</h2>
            <p className="mt-2 max-w-[70ch] text-body-sm text-muted">{route.description}</p>
          </div>
          <span className={`shrink-0 text-caption ${route.enabled ? "text-success-text" : "text-muted"}`}>
            {route.enabled ? labels.routeEnabled : labels.routeDisabled}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="rounded-control border border-line-subtle px-1.5 py-0.5 text-caption text-dim">{capability}</span>
          <GenerationRouteTags limit={route.tags.length} tags={route.tags} wrapLabels />
        </div>
      </header>

      {!provider.enabled ? (
        <div className="flex items-center justify-between gap-4 rounded-control border border-warning/40 bg-warning/8 px-3 py-2.5">
          <p className="text-meta text-warning">{disabledReason}</p>
          <Button onClick={onOpenProvider} size="small" type="link">{labels.goToProviderSettings}</Button>
        </div>
      ) : null}

      <SettingsSection title={labels.routeSettings}>
        <SettingsRow description={labels.routeEnabledDescription} label={labels.routeEnabled}>
          <Tooltip title={disabledReason}>
            <span className="inline-flex w-full justify-end">
              <Switch
                aria-label={`${route.name} ${route.enabled ? labels.routeEnabled : labels.routeDisabled}`}
                checked={route.enabled}
                disabled={!provider.enabled}
                loading={updatingRoute}
                onChange={onToggle}
              />
            </span>
          </Tooltip>
        </SettingsRow>
        <SettingsRow description={format(labels.defaultForCapabilityDescription, capability)} label={format(labels.defaultForCapability, capability)}>
          {route.isDefault ? (
            <span className="flex items-center justify-end gap-1.5 text-caption text-success-text">
              <CheckCircle2 className="size-4" />
              {labels.defaultRoute}
            </span>
          ) : (
            <Tooltip title={defaultDisabledReason}>
              <span className="inline-flex w-full justify-end">
                <Button
                  disabled={Boolean(defaultDisabledReason)}
                  loading={updatingDefault}
                  onClick={makeDefault}
                  size="small"
                >
                  {format(labels.makeDefaultForCapability, capability)}
                </Button>
              </span>
            </Tooltip>
          )}
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title={labels.routeDetails}>
        <ReadOnlyValue label={labels.provider} value={provider.displayName} />
        <ReadOnlyValue label={labels.modelProduct} value={route.product} />
        <ReadOnlyValue label={labels.capability} value={capability} />
        <ReadOnlyValue label={labels.catalogRevision} value={String(route.revision)} mono />
      </SettingsSection>

      <SettingsSection title={labels.supportedInputs}>
        <InputDefinitionRow
          description={route.inputSchema.prompt.maxLength
            ? `${labels.maximumLength}: ${route.inputSchema.prompt.maxLength}`
            : undefined}
          label={labels.prompt}
          meta={route.inputSchema.prompt.required ? labels.required : labels.optional}
        />
        {(route.inputSchema.assets ?? []).map((asset) => (
          <InputDefinitionRow
            description={assetDescription(asset, labels)}
            key={asset.key}
            label={asset.label}
            meta={asset.required ? labels.required : labels.optional}
          />
        ))}
        {(route.inputSchema.parameters ?? []).map((field) => (
          <InputDefinitionRow
            description={parameterDescription(field, labels)}
            key={field.key}
            label={field.label}
            meta={field.required ? labels.required : labels.optional}
          />
        ))}
      </SettingsSection>
    </div>
  );
}

function ReadOnlyValue({ label, mono = false, value }: { label: string; mono?: boolean; value: string }) {
  return (
    <SettingsRow label={label}>
      <span className={`block text-right text-meta text-primary ${mono ? "font-ui-mono" : ""}`}>{value}</span>
    </SettingsRow>
  );
}

function InputDefinitionRow({ description, label, meta }: { description?: string; label: string; meta: string }) {
  return (
    <SettingsRow compact description={description} label={label}>
      <span className="text-caption text-dim">{meta}</span>
    </SettingsRow>
  );
}

function parameterDescription(field: GenerationParameterField, labels: Labels) {
  const details = [field.description, labels.parameterType.replace("{type}", field.type)];
  if (field.defaultValue !== undefined) details.push(`${labels.defaultValue}: ${formatValue(field.defaultValue)}`);
  if (field.options?.length) details.push(`${labels.allowedValues}: ${field.options.map((option) => option.label).join(" / ")}`);
  if (field.min !== undefined || field.max !== undefined) details.push(`${labels.valueRange}: ${field.min ?? "−∞"} – ${field.max ?? "+∞"}`);
  return details.filter(Boolean).join(" · ");
}

function assetDescription(asset: GenerationAssetSlot, labels: Labels) {
  const maximum = asset.maxFiles ?? (asset.multiple ? undefined : 1);
  return [asset.description, labels.assetType.replace("{type}", asset.mediaType), maximum ? `${labels.maximumFiles}: ${maximum}` : undefined]
    .filter(Boolean)
    .join(" · ");
}

function formatValue(value: JsonValue) {
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function format(template: string, value: string) {
  return template.replace("{provider}", value).replace("{capability}", value);
}

export function capabilityLabel(capability: GenerationRouteDto["capability"], labels: Labels) {
  if (capability === "text-to-image") return labels.capabilityTextToImage;
  if (capability === "image-to-image") return labels.capabilityImageToImage;
  if (capability === "text-to-video") return labels.capabilityTextToVideo;
  if (capability === "image-to-video") return labels.capabilityImageToVideo;
  return labels.capabilityMultimodalToVideo;
}
