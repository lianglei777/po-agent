"use client";

import { CheckCircle2, Eye, EyeOff, KeyRound, Layers, Trash2 } from "@/components/icons";
import { useEffect, useState } from "react";
import { Alert, App, Button, Collapse, Input, Skeleton, Switch, Tooltip } from "antd";
import { useShallow } from "zustand/react/shallow";
import type { GenerationRouteDto } from "@/contracts/generation";
import { GenerationRouteTags } from "@/components/generation/generation-route-presentation";
import { useI18n } from "@/i18n/use-i18n";
import {
  deleteRunningHubGenerationCredential,
  loadGenerationRoutes,
  loadRunningHubGenerationCredential,
  loadRunningHubGenerationSettings,
  saveRunningHubGenerationCredential,
  updateGenerationRoute,
  updateRunningHubGenerationSettings,
} from "./api";
import { useContentGenerationStore } from "./state/content-generation-store-provider";

export function ContentGenerationSettings({
  onDirtyChange,
}: {
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { t } = useI18n();
  const { message, modal } = App.useApp();
  const labels = t.contentGeneration;
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  // Store 会保留上次结果，本地就绪标记用于阻止重新挂载时展示陈旧控件。
  const [settingsReady, setSettingsReady] = useState(false);
  const {
    applySettingsData,
    beginSettingsLoad,
    hasCredential,
    providerEnabled,
    routes,
    savingCredential: saving,
    setHasCredential,
    setProviderEnabled,
    setSavingCredential,
    setSettingsError,
    setSettingsLoading,
    setUpdatingId,
    settingsError: error,
    settingsLoading: loading,
    updateRoute,
    updatingId,
  } = useContentGenerationStore(
    useShallow(
      ({
        applySettingsData,
        beginSettingsLoad,
        hasCredential,
        providerEnabled,
        routes,
        savingCredential,
        setHasCredential,
        setProviderEnabled,
        setSavingCredential,
        setSettingsError,
        setSettingsLoading,
        setUpdatingId,
        settingsError,
        settingsLoading,
        updateRoute,
        updatingId,
      }) => ({
        applySettingsData,
        beginSettingsLoad,
        hasCredential,
        providerEnabled,
        routes,
        savingCredential,
        setHasCredential,
        setProviderEnabled,
        setSavingCredential,
        setSettingsError,
        setSettingsLoading,
        setUpdatingId,
        settingsError,
        settingsLoading,
        updateRoute,
        updatingId,
      }),
    ),
  );

  useEffect(() => {
    let disposed = false;
    beginSettingsLoad();
    void Promise.all([
      loadRunningHubGenerationCredential(),
      loadGenerationRoutes(),
      loadRunningHubGenerationSettings(),
    ])
      .then(([credential, nextRoutes, provider]) => {
        if (disposed) return;
        applySettingsData(
          nextRoutes,
          credential.hasCredential,
          provider.enabled,
        );
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
  }, [
    applySettingsData,
    beginSettingsLoad,
    setSettingsError,
    setSettingsLoading,
  ]);

  useEffect(() => {
    onDirtyChange?.(apiKey.length > 0);
  }, [apiKey, onDirtyChange]);

  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const displayLoading = loading || !settingsReady;
  const routeGroups = groupRoutesByProduct(routes);

  async function saveCredential() {
    const value = apiKey.trim();
    if (!value || saving) return;
    setSavingCredential(true);
    setSettingsError("");
    try {
      const status = await saveRunningHubGenerationCredential(value);
      setHasCredential(status.hasCredential);
      setApiKey("");
    } catch (cause) {
      setSettingsError(messageOf(cause));
    } finally {
      setSavingCredential(false);
    }
  }

  async function removeCredential() {
    if (saving || !await modal.confirm({
      cancelText: t.common.cancel,
      centered: true,
      content: labels.removeCredentialConfirm,
      focusable: { autoFocusButton: "cancel" },
      keyboard: false,
      mask: { closable: false },
      okButtonProps: { danger: true },
      okText: t.common.delete,
      title: labels.runningHubCredential,
    })) return;
    setSavingCredential(true);
    setSettingsError("");
    try {
      const status = await deleteRunningHubGenerationCredential();
      setHasCredential(status.hasCredential);
      setApiKey("");
    } catch (cause) {
      setSettingsError(messageOf(cause));
    } finally {
      setSavingCredential(false);
    }
  }

  async function toggleProvider(enabled: boolean) {
    setUpdatingId("runninghub");
    setSettingsError("");
    try {
      setProviderEnabled(
        (await updateRunningHubGenerationSettings(enabled)).enabled,
      );
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
      const updated = await updateGenerationRoute(routeId, { enabled });
      updateRoute(updated);
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

        <section className="max-w-3xl space-y-4">
          <div className="flex items-center justify-between gap-6 rounded-lg border border-line-subtle p-4">
            <div>
              <h3 className="text-sm font-semibold text-primary">
                {labels.runningHubEnabled}
              </h3>
              <p className="mt-1 text-xs text-muted">
                {labels.runningHubEnabledDescription}
              </p>
            </div>
            <Switch
              aria-label={labels.runningHubEnabled}
              checked={providerEnabled}
              disabled={displayLoading}
              loading={updatingId === "runninghub"}
              onChange={(enabled) => void toggleProvider(enabled)}
            />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-primary">
              {labels.runningHubCredential}
            </h3>
            <p className="mt-1 text-xs text-muted">
              {labels.runningHubCredentialDescription}
            </p>
          </div>
          <div className="rounded-lg border border-line-subtle bg-subtle p-4">
            <div className="mb-3 flex items-center gap-2 text-xs text-muted">
              <KeyRound className="size-4" />
              <span>
                {hasCredential ? labels.apiKeyStored : labels.credentialMissing}
              </span>
            </div>
            <label className="block space-y-1.5 text-xs font-medium text-primary">
              <span>{labels.apiKey}</span>
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <Input.Password
                    autoComplete="off"
                    disabled={displayLoading || saving}
                    iconRender={(visible) => (visible ? <EyeOff /> : <Eye />)}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={
                      hasCredential
                        ? labels.apiKeyStored
                        : labels.apiKeyPlaceholder
                    }
                    value={apiKey}
                    visibilityToggle={{
                      visible: showApiKey,
                      onVisibleChange: setShowApiKey,
                    }}
                  />
                </div>
                <Button
                  disabled={!apiKey.trim() || displayLoading || saving}
                  htmlType="button"
                  loading={saving}
                  onClick={() => void saveCredential()}
                  type="primary"
                >
                  {t.common.save}
                </Button>
              </div>
            </label>
            {hasCredential ? (
              <Button
                className="mt-3"
                danger
                disabled={displayLoading || saving}
                htmlType="button"
                icon={<Trash2 />}
                onClick={() => void removeCredential()}
                size="small"
                type="text"
              >
                {labels.removeCredential}
              </Button>
            ) : null}
            {error ? (
              <Alert className="mt-3" showIcon title={error} type="error" />
            ) : null}
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-primary">
              {labels.availableRoutes}
            </h3>
            <p className="mt-1 text-xs text-muted">
              {labels.availableRoutesDescription}
            </p>
          </div>
          {displayLoading ? (
            <Skeleton
              active
              className="p-4"
              paragraph={{ rows: 3 }}
              title={false}
            />
          ) : (
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
                            <div
                              className="group/api pl-4"
                              key={route.id}
                            >
                              <div
                                className={`grid grid-cols-[minmax(0,1fr)_auto] items-start gap-5 py-3.5 pl-3 pr-4 transition-colors duration-200 hover:bg-hover motion-reduce:transition-none ${routeIndex === group.routes.length - 1 ? "border-b-0" : "border-b border-line-subtle"} ${providerEnabled ? "" : "opacity-60"}`}
                              >
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-primary">
                                    {route.name}
                                  </p>
                                  <p className="mt-1 text-xs text-muted">
                                    {route.description}
                                  </p>
                                  <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
                                    <span className="rounded-control border border-line-subtle px-1.5 py-0.5 text-caption text-dim">
                                      {capabilityLabel(route.capability, labels)}
                                    </span>
                                    <GenerationRouteTags limit={route.tags.length} tags={route.tags} wrapLabels />
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 pt-0.5">
                                  {route.enabled ? (
                                    route.isDefault ? (
                                      <span className="text-caption text-[var(--success)]">
                                        {labels.defaultRoute}
                                      </span>
                                    ) : (
                                      <Tooltip title={labels.makeDefaultRoute}>
                                        <Button
                                          aria-label={labels.makeDefaultRoute}
                                          className="opacity-0 transition-opacity duration-150 group-hover/api:opacity-100 group-focus-within/api:opacity-100 motion-reduce:transition-none"
                                          disabled={!providerEnabled}
                                          icon={<CheckCircle2 className="size-3.5" />}
                                          loading={updatingId === `default:${route.id}`}
                                          onClick={() => void makeDefaultRoute(route.id)}
                                          size="small"
                                          type="text"
                                        />
                                      </Tooltip>
                                    )
                                  ) : null}
                                  <Tooltip
                                  title={
                                    !providerEnabled
                                      ? labels.enableProviderFirst
                                      : undefined
                                  }
                                >
                                  <span className="inline-flex w-11 shrink-0 justify-end">
                                    <Switch
                                      aria-label={`${route.name} ${route.enabled ? labels.routeEnabled : labels.routeDisabled}`}
                                      checked={route.enabled}
                                      disabled={!providerEnabled}
                                      loading={updatingId === route.id}
                                      onChange={(enabled) =>
                                        void toggleRoute(route.id, enabled)
                                      }
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
                            <span className="truncate text-sm font-semibold text-primary">
                              {group.product}
                            </span>
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
          )}
        </section>
      </div>
    </div>
  );
}

function messageOf(value: unknown) {
  return value instanceof Error ? value.message : "Request failed";
}

function capabilityLabel(
  capability: GenerationRouteDto["capability"],
  labels: {
    capabilityTextToImage: string;
    capabilityImageToImage: string;
    capabilityTextToVideo: string;
    capabilityImageToVideo: string;
    capabilityMultimodalToVideo: string;
  },
) {
  if (capability === "text-to-image") return labels.capabilityTextToImage;
  if (capability === "image-to-image") return labels.capabilityImageToImage;
  if (capability === "text-to-video") return labels.capabilityTextToVideo;
  if (capability === "image-to-video") return labels.capabilityImageToVideo;
  return labels.capabilityMultimodalToVideo;
}

// 按产品分组路由，保持首次出现顺序
function groupRoutesByProduct(routes: GenerationRouteDto[]) {
  const groups: { product: string; routes: GenerationRouteDto[] }[] = [];
  for (const route of routes) {
    const existing = groups.find((g) => g.product === route.product);
    if (existing) {
      existing.routes.push(route);
    } else {
      groups.push({ product: route.product, routes: [route] });
    }
  }
  return groups;
}
