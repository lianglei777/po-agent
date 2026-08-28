"use client";

import { Alert, Button, Input, Switch } from "antd";
import { Copy, Eye, EyeOff, KeyRound, Trash2 } from "@/components/icons";
import { SettingsRow, SettingsSection } from "@/components/ui/settings-form";
import type { GenerationProviderDescriptorDto, GenerationRouteDto } from "@/contracts/generation";
import { useI18n } from "@/i18n/use-i18n";

export function ContentGenerationProviderDetail({
  apiKey,
  credentialBusy,
  onApiKeyChange,
  onCopyCredentialLocation,
  onRemoveCredential,
  onSaveCredential,
  onToggle,
  onVisibilityChange,
  provider,
  routes,
  saving,
  updating,
  visibleApiKey,
}: {
  apiKey: string;
  credentialBusy: boolean;
  onApiKeyChange: (value: string) => void;
  onCopyCredentialLocation: (location: string) => void;
  onRemoveCredential: () => void;
  onSaveCredential: () => void;
  onToggle: (enabled: boolean) => void;
  onVisibilityChange: (visible: boolean) => void;
  provider: GenerationProviderDescriptorDto;
  routes: GenerationRouteDto[];
  saving: boolean;
  updating: boolean;
  visibleApiKey: boolean;
}) {
  const { t } = useI18n();
  const labels = t.contentGeneration;
  const enabledCount = routes.filter((route) => route.enabled).length;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-6 py-6">
      <header className="flex items-start justify-between gap-8 border-b border-line-subtle pb-5">
        <div className="min-w-0">
          <p className="text-caption font-medium text-dim">{labels.providerSettings}</p>
          <h2 className="mt-1 truncate text-lg font-semibold text-primary">{provider.displayName}</h2>
          <p className="mt-1 font-ui-mono text-caption text-muted">{provider.providerId}</p>
        </div>
        <span className={`shrink-0 text-caption ${provider.enabled ? "text-success-text" : "text-muted"}`}>
          {provider.enabled ? labels.providerEnabledStatus : labels.providerDisabledStatus}
        </span>
      </header>

      {provider.credential && !provider.credential.hasCredential ? (
        <Alert showIcon title={labels.credentialMissing} type="warning" />
      ) : null}

      <SettingsSection title={labels.providerSettings}>
        <SettingsRow
          description={labels.providerEnabledDescription}
          label={format(labels.providerEnabled, provider.displayName)}
        >
          <div className="flex justify-end">
            <Switch
              aria-label={format(labels.providerEnabled, provider.displayName)}
              checked={provider.enabled}
              loading={updating}
              onChange={onToggle}
            />
          </div>
        </SettingsRow>
        <SettingsRow description={labels.availableRoutesDescription} label={labels.availableRoutes}>
          <span className="block text-right text-sm tabular-nums text-primary">
            {labels.routeEnabledCount
              .replace("{enabled}", String(enabledCount))
              .replace("{total}", String(routes.length))}
          </span>
        </SettingsRow>
      </SettingsSection>

      {provider.credential ? (
        <SettingsSection title={format(labels.providerCredential, provider.displayName)}>
          <SettingsRow
            align="start"
            description={format(labels.providerCredentialDescription, provider.credential.environmentVariable)}
            label={labels.apiKey}
          >
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-caption text-muted">
                <KeyRound className="size-4" />
                <span>
                  {provider.credential.source === "stored-file"
                    ? labels.apiKeyStored
                    : provider.credential.source === "environment"
                      ? labels.apiKeyFromEnvironment
                      : labels.credentialMissing}
                </span>
              </div>
              <dl className="grid gap-2 rounded-control border border-line-subtle bg-subtle px-3 py-2.5 text-caption sm:grid-cols-[6rem_minmax(0,1fr)]">
                <dt className="text-dim">{labels.credentialSource}</dt>
                <dd className="text-primary">
                  {credentialSourceLabel(provider.credential.source, labels)}
                </dd>
                <dt className="text-dim">{labels.credentialLocation}</dt>
                <dd className="flex min-w-0 items-center gap-1">
                  <code className="block min-w-0 flex-1 truncate font-ui-mono text-muted" title={provider.credential.location}>
                    {provider.credential.location}
                  </code>
                  <Button
                    aria-label={labels.copyCredentialLocation}
                    className="shrink-0"
                    htmlType="button"
                    icon={<Copy />}
                    onClick={() => onCopyCredentialLocation(provider.credential?.location ?? "")}
                    shape="circle"
                    size="small"
                    title={labels.copyLocation}
                    type="text"
                  />
                </dd>
              </dl>
              <div className="flex gap-2">
                <Input.Password
                  autoComplete="off"
                  disabled={credentialBusy}
                  iconRender={(visible) => visible ? <EyeOff /> : <Eye />}
                  onChange={(event) => onApiKeyChange(event.target.value)}
                  placeholder={provider.credential.hasCredential ? labels.apiKeyStored : labels.apiKeyPlaceholder}
                  value={apiKey}
                  visibilityToggle={{ visible: visibleApiKey, onVisibleChange: onVisibilityChange }}
                />
                <Button
                  disabled={!apiKey.trim() || credentialBusy}
                  htmlType="button"
                  loading={saving}
                  onClick={onSaveCredential}
                  type="primary"
                >
                  {t.common.save}
                </Button>
              </div>
              {provider.credential.source === "stored-file" ? (
                <Button
                  danger
                  disabled={credentialBusy}
                  htmlType="button"
                  icon={<Trash2 />}
                  onClick={onRemoveCredential}
                  size="small"
                  type="text"
                >
                  {labels.removeCredential}
                </Button>
              ) : null}
            </div>
          </SettingsRow>
        </SettingsSection>
      ) : null}
    </div>
  );
}

function format(template: string, value: string) {
  return template.replace("{provider}", value).replace("{environment}", value);
}

function credentialSourceLabel(
  source: NonNullable<GenerationProviderDescriptorDto["credential"]>["source"],
  labels: ReturnType<typeof useI18n>["t"]["contentGeneration"],
) {
  if (source === "stored-file") return labels.credentialSourceStoredFile;
  if (source === "environment") return labels.credentialSourceEnvironment;
  return labels.credentialSourceMissing;
}
