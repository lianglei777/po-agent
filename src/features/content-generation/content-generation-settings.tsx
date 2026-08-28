"use client";

import { Alert, App, Empty, Skeleton } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ResizeHandle } from "@/components/ui/resize-handle";
import type { GenerationProviderDescriptorDto } from "@/contracts/generation";
import { useI18n } from "@/i18n/use-i18n";
import {
  deleteGenerationProviderCredential,
  loadGenerationProviders,
  loadGenerationRoutes,
  saveGenerationProviderCredential,
  updateGenerationProviderSettings,
  updateGenerationRoute,
} from "./api";
import { ContentGenerationNavigator } from "./content-generation-navigator";
import { ContentGenerationProviderDetail } from "./content-generation-provider-detail";
import { ContentGenerationRouteDetail } from "./content-generation-route-detail";
import {
  reconcileContentGenerationSelection,
  type ContentGenerationSettingsSelection,
} from "./content-generation-settings-model";
import { useContentGenerationStore } from "./state/content-generation-store-provider";

const DEFAULT_NAVIGATOR_WIDTH = 256;
const MIN_NAVIGATOR_WIDTH = 224;
const MAX_NAVIGATOR_WIDTH = 360;
const NAVIGATOR_WIDTH_STORAGE_KEY = "po.content-generation.navigator-width.v1";

export function ContentGenerationSettings({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const { t } = useI18n();
  const { message, modal } = App.useApp();
  const labels = t.contentGeneration;
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [visibleApiKeys, setVisibleApiKeys] = useState<Record<string, boolean>>({});
  const [requestedSelection, setRequestedSelection] = useState<ContentGenerationSettingsSelection | null>(null);
  const [navigatorWidth, setNavigatorWidth] = useState(DEFAULT_NAVIGATOR_WIDTH);
  // Store 会保留上次结果，本地就绪标记用于阻止重新挂载时展示陈旧控件。
  const [settingsReady, setSettingsReady] = useState(false);
  const {
    applySettingsData, beginSettingsLoad, providers, routes, savingCredentialId,
    setProviderCredentialStatus, setSavingCredentialId, setSettingsError,
    setSettingsLoading, setUpdatingId, settingsError: error,
    settingsLoading: loading, updateProvider, updateRoute, updatingId,
  } = useContentGenerationStore(useShallow((state) => ({
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
  })));

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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setNavigatorWidth(readNavigatorWidth());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const displayLoading = loading || !settingsReady;
  const selection = reconcileContentGenerationSelection(providers, routes, requestedSelection);
  const selectedProvider = selection?.type === "provider"
    ? providers.find((provider) => provider.providerId === selection.providerId)
    : undefined;
  const selectedRoute = selection?.type === "route"
    ? routes.find((route) => route.id === selection.routeId)
    : undefined;
  const routeProvider = selectedRoute
    ? providers.find((provider) => provider.providerId === selectedRoute.providerId)
    : undefined;
  const credentialDraftProviderIds = useMemo(
    () => new Set(Object.entries(apiKeys).filter(([, value]) => value.length > 0).map(([providerId]) => providerId)),
    [apiKeys],
  );

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
      setProviderCredentialStatus(provider.providerId, status);
      setApiKey(provider.providerId, "");
      void message.success(t.common.settingsSaved);
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
      setProviderCredentialStatus(provider.providerId, status);
      setApiKey(provider.providerId, "");
      void message.success(t.common.settingsSaved);
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

  async function copyCredentialLocation(location: string) {
    try {
      await navigator.clipboard.writeText(location);
      void message.success(labels.credentialLocationCopied);
    } catch {
      setSettingsError(labels.credentialLocationCopyFailed);
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

  if (displayLoading) {
    return <Skeleton active className="flex-1 p-6" paragraph={{ rows: 10 }} title={false} />;
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 bg-canvas">
      <ContentGenerationNavigator
        credentialDraftProviderIds={credentialDraftProviderIds}
        onSelect={setRequestedSelection}
        providers={providers}
        routes={routes}
        selection={selection}
        width={navigatorWidth}
      />
      <ResizeHandle
        ariaLabel={labels.resizeNavigator}
        direction={1}
        max={MAX_NAVIGATOR_WIDTH}
        min={MIN_NAVIGATOR_WIDTH}
        onResize={(width) => {
          setNavigatorWidth(width);
          window.localStorage.setItem(NAVIGATOR_WIDTH_STORAGE_KEY, String(width));
        }}
        value={navigatorWidth}
      />
      <main className="min-w-0 flex-1 overflow-y-auto">
        {error ? <Alert className="m-6 mb-0" closable onClose={() => setSettingsError("")} showIcon title={error} type="error" /> : null}
        {selectedProvider ? (
          <ContentGenerationProviderDetail
            apiKey={apiKeys[selectedProvider.providerId] ?? ""}
            credentialBusy={Boolean(savingCredentialId)}
            onApiKeyChange={(value) => setApiKey(selectedProvider.providerId, value)}
            onCopyCredentialLocation={(location) => void copyCredentialLocation(location)}
            onRemoveCredential={() => void removeCredential(selectedProvider)}
            onSaveCredential={() => void saveCredential(selectedProvider)}
            onToggle={(enabled) => void toggleProvider(selectedProvider, enabled)}
            onVisibilityChange={(visible) => setVisibleApiKeys((current) => ({ ...current, [selectedProvider.providerId]: visible }))}
            provider={selectedProvider}
            routes={routes.filter((route) => route.providerId === selectedProvider.providerId)}
            saving={savingCredentialId === selectedProvider.providerId}
            updating={updatingId === `provider:${selectedProvider.providerId}`}
            visibleApiKey={visibleApiKeys[selectedProvider.providerId] ?? false}
          />
        ) : selectedRoute && routeProvider ? (
          <ContentGenerationRouteDetail
            makeDefault={() => void makeDefaultRoute(selectedRoute.id)}
            onOpenProvider={() => setRequestedSelection({ type: "provider", providerId: routeProvider.providerId })}
            onToggle={(enabled) => void toggleRoute(selectedRoute.id, enabled)}
            provider={routeProvider}
            route={selectedRoute}
            updatingDefault={updatingId === `default:${selectedRoute.id}`}
            updatingRoute={updatingId === selectedRoute.id}
          />
        ) : (
          <Empty className="my-20" description={labels.emptyProviders} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </main>
    </div>
  );
}

function messageOf(value: unknown) {
  return value instanceof Error ? value.message : "Request failed";
}

function format(template: string, value: string) {
  return template.replace("{provider}", value).replace("{environment}", value);
}

function readNavigatorWidth() {
  const raw = window.localStorage.getItem(NAVIGATOR_WIDTH_STORAGE_KEY);
  if (raw === null) return DEFAULT_NAVIGATOR_WIDTH;
  const stored = Number(raw);
  if (!Number.isFinite(stored)) return DEFAULT_NAVIGATOR_WIDTH;
  return Math.min(MAX_NAVIGATOR_WIDTH, Math.max(MIN_NAVIGATOR_WIDTH, stored));
}
