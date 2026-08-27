"use client";

import { GenerationRouteTags } from "@/components/generation/generation-route-presentation";
import { CheckCircle2, Eye, EyeOff, KeyRound, Layers, Trash2 } from "@/components/icons";
import type { GenerationProviderDescriptorDto, GenerationRouteDto } from "@/contracts/generation";
import { useI18n } from "@/i18n/use-i18n";
import { Alert, App, Button, Collapse, Input, Skeleton, Switch, Tooltip } from "antd";
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  deleteGenerationProviderCredential,
  loadGenerationProviders,
  loadGenerationRoutes,
  saveGenerationProviderCredential,
  updateGenerationProviderSettings,
  updateGenerationRoute,
} from "./api";
import { useContentGenerationStore } from "./state/content-generation-store-provider";

type Labels = ReturnType<typeof useI18n>["t"]["contentGeneration"];

export function ContentGenerationSettings({
  onDirtyChange,
}: {
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { t } = useI18n();
  const { message, modal } = App.useApp();
  const labels = t.contentGeneration;
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [visibleApiKeys, setVisibleApiKeys] = useState<Record<string, boolean>>({});
  // Store 会保留上次结果，本地就绪标记用于阻止重新挂载时展示陈旧控件。
  const [settingsReady, setSettingsReady] = useState(false);
  const {
    applySettingsData,
    beginSettingsLoad,
    providers,
    routes,
    savingCredentialId,
    setProviderCredentialStatus,
    setSavingCredentialId,
    setSettingsError,
    setSettingsLoading,
    setUpdatingId,
    settingsError: error,
    settingsLoading: loading,
    updateProvider,
    updateRoute,
    updatingId,
  } = useContentGenerationStore(
    useShallow((state) => ({
      applySettingsData: state.applySettingsData,
      beginSettingsLoad: state.beginSettingsLoad,
      providers: state.providers,
      routes: state.routes,
      savingCredentialId: state.savingCredentialId,
      setProviderCredentialStatus: state.setProviderCredentialStatus,
      setSavingCredentialId: state.setSavingCredentialId,
      setSettingsError: state.setSettingsError,
      setSettingsLoading: state.setSettingsLoading,
      setUpdatingId: state.setUpdatingId,
      settingsError: state.settingsError,
      settingsLoading: state.settingsLoading,
      updateProvider: state.updateProvider,
      updateRoute: state.updateRoute,
      updatingId: state.updatingId,
    })),
  );

  useEffect(() => {
    let disposed = false;
    beginSettingsLoad();
    void Promise.all([loadGenerationRoutes(), loadGenerationProviders()])
      .then(([nextRoutes, nextProviders]) => {
        if (!disposed) applySettingsData(nextRoutes, nextProviders);
      })
      .catch((cause) => !disposed && setSettingsError(messageOf(cause)))
      .finally(() => {
        if (disposed) return;
        setSettingsLoading(false);
        setSettingsReady(true);
      });
    return () => {
      disposed = true;
    };
  }, [applySettingsData, beginSettingsLoad, setSettingsError, setSettingsLoading]);

  useEffect(() => {
    onDirtyChange?.(Object.values(apiKeys).some((value) => value.length > 0));
  }, [apiKeys, onDirtyChange]);

  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const displayLoading = loading || !settingsReady;

  function setApiKey(providerId: string, value: string) {
    setApiKeys((current) => ({ ...current, [providerId]: value }));
  }

  async function saveCredential(provider: GenerationProviderDescriptorDto) {
    const value = apiKeys[provider.providerId]?.trim() ?? "";
    if (!value || savingCredentialId) return;
    setSavingCredentialId(provider.providerId);
    setSettingsError("");
    try {
      const status = await saveGenerationProviderCredential(provider.providerId, value);
      setProviderCredentialStatus(provider.providerId, status.hasCredential);
      setApiKey(provider.providerId, "");
    } catch (cause) {
      setSettingsError(messageOf(cause));
    } finally {
      setSavingCredentialId(null);
    }
  }

  async function removeCredential(provider: GenerationProviderDescriptorDto) {
    if (savingCredentialId || !await modal.confirm({
      cancelText: t.common.cancel,
      centered: true,
      content: format(labels.removeCredentialConfirm, provider.displayName),
      focusable: { autoFocusButton: "cancel" },
      keyboard: false,
      mask: { closable: false },
      okButtonProps: { danger: true },
      okText: t.common.delete,
      title: format(labels.providerCredential, provider.displayName),
    })) return;
    setSavingCredentialId(provider.providerId);
    setSettingsError("");
    try {
      const status = await deleteGenerationProviderCredential(provider.providerId);
      setProviderCredentialStatus(provider.providerId, status.hasCredential);
      setApiKey(provider.providerId, "");
    } catch (cause) {
      setSettingsError(messageOf(cause));
    } finally {
      setSavingCredentialId(null);
    }
  }

  async function toggleProvider(provider: GenerationProviderDescriptorDto, enabled: boolean) {
    setUpdatingId(`provider:${provider.providerId}`);
    setSettingsError("");
    try {
      const updated = await updateGenerationProviderSettings(provider.providerId, enabled);
      updateProvider({ ...provider, enabled: updated.enabled });
      void message.success(t.common.settingsSaved);
    } catch (cause) {
      setSettingsError(messageOf(cause));
    } finally {
      setUpdatingId(null);
    }
  }

  async function toggleRoute(routeId: string, enabled: boolean) {
    setUpdatingId(routeId);
    setSettingsError("");
    try {
      updateRoute(await updateGenerationRoute(routeId, { enabled }));
      void message.success(t.common.settingsSaved);
    } catch (cause) {
      setSettingsError(messageOf(cause));
    } finally {
      setUpdatingId(null);
    }
  }

  async function makeDefaultRoute(routeId: string) {
    setUpdatingId(`default:${routeId}`);
    setSettingsError("");
    try {
      updateRoute(await updateGenerationRoute(routeId, { isDefault: true }));
      void message.success(t.common.settingsSaved);
    } catch (cause) {
      setSettingsError(messageOf(cause));
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="border-b border-line-subtle pb-4">
          <h2 className="text-lg font-semibold text-primary">{labels.title}</h2>
          <p className="mt-1 text-body-sm text-muted">{labels.description}</p>
        </header>

        {error ? <Alert showIcon title={error} type="error" /> : null}

        {displayLoading ? (
          <Skeleton active className="p-4" paragraph={{ rows: 8 }} title={false} />
        ) : (
          <div className="space-y-6">
            {providers.map((provider) => {
              const routeGroups = groupRoutesByProduct(
                routes.filter((route) => route.providerId === provider.providerId),
              );
              const saving = savingCredentialId === provider.providerId;
              const apiKey = apiKeys[provider.providerId] ?? "";
              return (
                <section
                  className="overflow-hidden rounded-lg border border-line-subtle bg-panel"
                  key={provider.providerId}
                >
                  <div className="flex items-center justify-between gap-6 border-b border-line-subtle bg-subtle p-4">
                    <div>
                      <h3 className="text-sm font-semibold text-primary">{provider.displayName}</h3>
                      <p className="mt-1 text-xs text-muted">{labels.providerEnabledDescription}</p>
                    </div>
                    <Switch
                      aria-label={format(labels.providerEnabled, provider.displayName)}
                      checked={provider.enabled}
                      loading={updatingId === `provider:${provider.providerId}`}
                      onChange={(enabled) => void toggleProvider(provider, enabled)}
                    />
                  </div>

                  {provider.credential ? (
                    <div className="max-w-3xl space-y-3 border-b border-line-subtle p-4">
                      <div>
                        <h4 className="text-sm font-semibold text-primary">
                          {format(labels.providerCredential, provider.displayName)}
                        </h4>
                        <p className="mt-1 text-xs text-muted">
                          {format(labels.providerCredentialDescription, provider.credential.environmentVariable)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-line-subtle bg-subtle p-4">
                        <div className="mb-3 flex items-center gap-2 text-xs text-muted">
                          <KeyRound className="size-4" />
                          <span>{provider.credential.hasCredential
                            ? labels.apiKeyStored
                            : labels.credentialMissing}</span>
                        </div>
                        <label className="block space-y-1.5 text-xs font-medium text-primary">
                          <span>{labels.apiKey}</span>
                          <div className="flex gap-2">
                            <div className="min-w-0 flex-1">
                              <Input.Password
                                autoComplete="off"
                                disabled={saving}
                                iconRender={(visible) => visible ? <EyeOff /> : <Eye />}
                                onChange={(event) => setApiKey(provider.providerId, event.target.value)}
                                placeholder={provider.credential.hasCredential
                                  ? labels.apiKeyStored
                                  : labels.apiKeyPlaceholder}
                                value={apiKey}
                                visibilityToggle={{
                                  visible: visibleApiKeys[provider.providerId] ?? false,
                                  onVisibleChange: (visible) => setVisibleApiKeys((current) => ({
                                    ...current,
                                    [provider.providerId]: visible,
                                  })),
                                }}
                              />
                            </div>
                            <Button
                              disabled={!apiKey.trim() || Boolean(savingCredentialId)}
                              htmlType="button"
                              loading={saving}
                              onClick={() => void saveCredential(provider)}
                              type="primary"
                            >
                              {t.common.save}
                            </Button>
                          </div>
                        </label>
                        {provider.credential.hasCredential ? (
                          <Button
                            className="mt-3"
                            danger
                            disabled={Boolean(savingCredentialId)}
                            htmlType="button"
                            icon={<Trash2 />}
                            onClick={() => void removeCredential(provider)}
                            size="small"
                            type="text"
                          >
                            {labels.removeCredential}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-3 p-4">
                    <div>
                      <h4 className="text-sm font-semibold text-primary">{labels.availableRoutes}</h4>
                      <p className="mt-1 text-xs text-muted">{labels.availableRoutesDescription}</p>
                    </div>
                    <RouteGroups
                      labels={labels}
                      makeDefaultRoute={makeDefaultRoute}
                      provider={provider}
                      routeGroups={routeGroups}
                      toggleRoute={toggleRoute}
                      updatingId={updatingId}
                    />
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function RouteGroups({
  labels,
  makeDefaultRoute,
  provider,
  routeGroups,
  toggleRoute,
  updatingId,
}: {
  labels: Labels;
  makeDefaultRoute: (routeId: string) => Promise<void>;
  provider: GenerationProviderDescriptorDto;
  routeGroups: ReturnType<typeof groupRoutesByProduct>;
  toggleRoute: (routeId: string, enabled: boolean) => Promise<void>;
  updatingId: string | null;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-line-subtle bg-panel">
      {routeGroups.map((group) => {
        const enabledCount = group.routes.filter((route) => route.enabled).length;
        return (
          <Collapse
            className="border-b-[8px] border-b-[var(--bg)] bg-subtle last:border-b-0"
            defaultActiveKey={[group.product]}
            expandIconPlacement="end"
            ghost
            items={[{
              children: (
                <div className="border-t border-line-subtle bg-panel">
                  {group.routes.map((route, routeIndex) => (
                    <div className="group/api pl-4" key={route.id}>
                      <div className={`grid grid-cols-[minmax(0,1fr)_auto] items-start gap-5 py-3.5 pl-3 pr-4 transition-colors duration-200 hover:bg-hover motion-reduce:transition-none ${routeIndex === group.routes.length - 1 ? "border-b-0" : "border-b border-line-subtle"} ${provider.enabled ? "" : "opacity-60"}`}>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-primary">{route.name}</p>
                          <p className="mt-1 text-xs text-muted">{route.description}</p>
                          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
                            <span className="rounded-control border border-line-subtle px-1.5 py-0.5 text-caption text-dim">
                              {capabilityLabel(route.capability, labels)}
                            </span>
                            <GenerationRouteTags limit={route.tags.length} tags={route.tags} wrapLabels />
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pt-0.5">
                          {route.enabled ? route.isDefault ? (
                            <span className="text-caption text-[var(--success)]">{labels.defaultRoute}</span>
                          ) : (
                            <Tooltip title={labels.makeDefaultRoute}>
                              <Button
                                aria-label={labels.makeDefaultRoute}
                                className="opacity-0 transition-opacity duration-150 group-hover/api:opacity-100 group-focus-within/api:opacity-100 motion-reduce:transition-none"
                                disabled={!provider.enabled}
                                icon={<CheckCircle2 className="size-3.5" />}
                                loading={updatingId === `default:${route.id}`}
                                onClick={() => void makeDefaultRoute(route.id)}
                                size="small"
                                type="text"
                              />
                            </Tooltip>
                          ) : null}
                          <Tooltip title={!provider.enabled
                            ? format(labels.enableProviderFirst, provider.displayName)
                            : undefined}>
                            <span className="inline-flex w-11 shrink-0 justify-end">
                              <Switch
                                aria-label={`${route.name} ${route.enabled ? labels.routeEnabled : labels.routeDisabled}`}
                                checked={route.enabled}
                                disabled={!provider.enabled}
                                loading={updatingId === route.id}
                                onChange={(enabled) => void toggleRoute(route.id, enabled)}
                              />
                            </span>
                          </Tooltip>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ),
              classNames: {
                body: "!p-0",
                header: "!min-h-12 !items-center !px-4 !py-3 hover:!bg-hover",
                title: "!min-w-0 !flex-1",
              },
              key: group.product,
              label: (
                <div className="flex min-w-0 items-center justify-between gap-4 pr-2">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-line-subtle bg-panel text-muted">
                      <Layers className="size-3.5" />
                    </span>
                    <span className="truncate text-sm font-semibold text-primary">{group.product}</span>
                  </span>
                  <span className="shrink-0 text-caption font-normal tabular-nums text-muted">
                    {labels.routeEnabledCount
                      .replace("{enabled}", String(enabledCount))
                      .replace("{total}", String(group.routes.length))}
                  </span>
                </div>
              ),
            }]}
            key={group.product}
            size="small"
          />
        );
      })}
    </div>
  );
}

function messageOf(value: unknown) {
  return value instanceof Error ? value.message : "Request failed";
}

function format(template: string, value: string) {
  return template.replace("{provider}", value).replace("{environment}", value);
}

function capabilityLabel(capability: GenerationRouteDto["capability"], labels: Labels) {
  if (capability === "text-to-image") return labels.capabilityTextToImage;
  if (capability === "image-to-image") return labels.capabilityImageToImage;
  if (capability === "text-to-video") return labels.capabilityTextToVideo;
  if (capability === "image-to-video") return labels.capabilityImageToVideo;
  return labels.capabilityMultimodalToVideo;
}

// 按产品分组路由，保持供应商 Catalog 的稳定顺序。
function groupRoutesByProduct(routes: GenerationRouteDto[]) {
  const groups: { product: string; routes: GenerationRouteDto[] }[] = [];
  for (const route of routes) {
    const existing = groups.find((group) => group.product === route.product);
    if (existing) existing.routes.push(route);
    else groups.push({ product: route.product, routes: [route] });
  }
  return groups;
}
