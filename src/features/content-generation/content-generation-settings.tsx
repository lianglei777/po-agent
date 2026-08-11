"use client";

import { Eye, EyeOff, KeyRound, Trash2 } from "@/components/icons";
import { useEffect, useState } from "react";
import { Alert, Button, Input, Skeleton, Switch, Tooltip } from "antd";
import { useShallow } from "zustand/react/shallow";
import type { GenerationRouteDto } from "@/contracts/generation";
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
    if (saving || !window.confirm(labels.removeCredentialConfirm)) return;
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
      setProviderEnabled((await updateRunningHubGenerationSettings(enabled)).enabled);
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
      const updated = await updateGenerationRoute(routeId, enabled);
      updateRoute(updated);
    } catch (cause) {
      setSettingsError(messageOf(cause));
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="border-b border-line-subtle pb-4">
          <h2 className="text-lg font-semibold text-primary">{labels.title}</h2>
          <p className="mt-1 text-body-sm text-muted">{labels.description}</p>
        </header>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-6 rounded-lg border border-line-subtle p-4">
            <div>
              <h3 className="text-sm font-semibold text-primary">{labels.runningHubEnabled}</h3>
              <p className="mt-1 text-xs text-muted">{labels.runningHubEnabledDescription}</p>
            </div>
            <Switch aria-label={labels.runningHubEnabled} checked={providerEnabled} disabled={displayLoading} loading={updatingId === "runninghub"} onChange={(enabled) => void toggleProvider(enabled)} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-primary">{labels.runningHubCredential}</h3>
            <p className="mt-1 text-xs text-muted">{labels.runningHubCredentialDescription}</p>
          </div>
          <div className="rounded-lg border border-line-subtle bg-subtle p-4">
            <div className="mb-3 flex items-center gap-2 text-xs text-muted">
              <KeyRound className="size-4" />
              <span>{hasCredential ? labels.apiKeyStored : labels.credentialMissing}</span>
            </div>
            <label className="block space-y-1.5 text-xs font-medium text-primary">
              <span>{labels.apiKey}</span>
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <Input.Password
                    autoComplete="off"
                    disabled={displayLoading || saving}
                    iconRender={(visible) => visible ? <EyeOff /> : <Eye />}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={hasCredential ? labels.apiKeyStored : labels.apiKeyPlaceholder}
                    value={apiKey}
                    visibilityToggle={{
                      visible: showApiKey,
                      onVisibleChange: setShowApiKey,
                    }}
                  />
                </div>
                <Button disabled={!apiKey.trim() || displayLoading || saving} htmlType="button" loading={saving} onClick={() => void saveCredential()} type="primary">
                  {t.common.save}
                </Button>
              </div>
            </label>
            {hasCredential ? (
              <Button className="mt-3" danger disabled={displayLoading || saving} htmlType="button" icon={<Trash2 />} onClick={() => void removeCredential()} size="small" type="text">
                {labels.removeCredential}
              </Button>
            ) : null}
            {error ? <Alert className="mt-3" showIcon title={error} type="error" /> : null}
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-primary">{labels.availableRoutes}</h3>
            <p className="mt-1 text-xs text-muted">{labels.availableRoutesDescription}</p>
          </div>
          {displayLoading ? (
            <Skeleton active className="p-4" paragraph={{ rows: 3 }} title={false} />
          ) : (
            <div className="space-y-3">
              {groupRoutesByProduct(routes).map((group) => (
                <div key={group.product}>
                  <p className="mb-1.5 px-1 text-xs font-semibold text-muted">{group.product}</p>
                  <div className="divide-y divide-line-subtle rounded-lg border border-line-subtle">
                    {group.routes.map((route) => (
                      <div className="flex items-center justify-between gap-4 p-4" key={route.id}>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-primary">{route.name}</p>
                          <p className="mt-1 font-ui-mono text-caption text-muted">{route.capability}</p>
                        </div>
                        <Tooltip title={!providerEnabled ? labels.enableProviderFirst : undefined}>
                          <span className="inline-flex shrink-0">
                            <Switch aria-label={`${route.name} ${route.enabled ? labels.routeEnabled : labels.routeDisabled}`} checked={route.enabled} disabled={!providerEnabled} loading={updatingId === route.id} onChange={(enabled) => void toggleRoute(route.id, enabled)} />
                          </span>
                        </Tooltip>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
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
