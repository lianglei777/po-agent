"use client";

import { useEffect } from "react";
import { Alert, Empty, Skeleton } from "antd";
import { useI18n } from "@/i18n/use-i18n";
import ApiKeyDetail from "./details/api-key-detail";
import ModelDetail from "./details/model-detail";
import OAuthDetail from "./details/oauth-detail";
import ProviderDetail from "./details/provider-detail";
import { ModelProviderSidebar } from "./sidebar/model-provider-sidebar";
import { ModelProvidersStoreProvider } from "./state/model-providers-store-provider";
import { useModelProviders } from "./use-model-providers";

export type ModelProviderSaveStatus =
  | { phase: "idle" | "pending" | "saving" | "saved" }
  | { phase: "error"; message: string; onRetry?: () => void };

type ModelProviderPageProps = {
  onDirtyChange: (dirty: boolean) => void;
  onSaved?: () => void;
  onSaveStatusChange?: (status: ModelProviderSaveStatus) => void;
};

export function ModelProviderPage(props: ModelProviderPageProps) {
  return (
    <ModelProvidersStoreProvider>
      <ModelProviderPageContent {...props} />
    </ModelProvidersStoreProvider>
  );
}

function ModelProviderPageContent({
  onDirtyChange,
  onSaved,
  onSaveStatusChange,
}: ModelProviderPageProps) {
  const modelConfig = useModelProviders(onSaved);

  useEffect(() => {
    onDirtyChange(modelConfig.dirty);
    return () => onDirtyChange(false);
  }, [modelConfig.dirty, onDirtyChange]);

  useEffect(() => {
    if (modelConfig.saveError) {
      onSaveStatusChange?.({
        phase: "error",
        message: modelConfig.saveError,
        onRetry: modelConfig.saveRetryAvailable
          ? modelConfig.retrySave
          : undefined,
      });
    } else if (modelConfig.saving) {
      onSaveStatusChange?.({ phase: "saving" });
    } else if (modelConfig.dirty) {
      onSaveStatusChange?.({ phase: "pending" });
    } else if (modelConfig.savedOk) {
      onSaveStatusChange?.({ phase: "saved" });
    } else {
      onSaveStatusChange?.({ phase: "idle" });
    }
  }, [
    modelConfig.dirty,
    modelConfig.retrySave,
    modelConfig.saveError,
    modelConfig.saveRetryAvailable,
    modelConfig.savedOk,
    modelConfig.saving,
    onSaveStatusChange,
  ]);

  useEffect(
    () => () => onSaveStatusChange?.({ phase: "idle" }),
    [onSaveStatusChange],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-canvas">
      {modelConfig.loading ? (
        <Skeleton active className="p-6" paragraph={{ rows: 8 }} />
      ) : (
        <div className="flex min-h-0 flex-1">
          <ModelProviderSidebar
            apiKeyProviders={modelConfig.apiKeyProviders}
            config={modelConfig.config}
            onAddProvider={modelConfig.addCustomProvider}
            onSelect={modelConfig.setSelection}
            selection={modelConfig.selection}
          />
          <main className="min-w-0 flex-1 overflow-y-auto px-6 py-6">
            {modelConfig.loadError ? (
              <Alert showIcon title={modelConfig.loadError} type="error" />
            ) : (
              <ModelsConfigDetail modelConfig={modelConfig} />
            )}
          </main>
        </div>
      )}
    </div>
  );
}

function ModelsConfigDetail({
  modelConfig,
}: {
  modelConfig: ReturnType<typeof useModelProviders>;
}) {
  const selection = modelConfig.selection;
  if (!selection) return <EmptySelection />;

  if (selection.type === "provider") {
    const provider = modelConfig.config.providers?.[selection.name];
    return provider ? (
      <ProviderDetail
        discovery={modelConfig.discovery}
        key={selection.name}
        name={selection.name}
        onAcceptDiscoveredModels={modelConfig.acceptDiscoveredModels}
        onChange={(next) => modelConfig.updateProvider(selection.name, next)}
        onDelete={modelConfig.deleteProvider}
        onDiscoverModels={modelConfig.discoverProviderModels}
        onRename={modelConfig.renameProvider}
        provider={provider}
      />
    ) : null;
  }

  if (selection.type === "model") {
    const provider = modelConfig.config.providers?.[selection.providerName];
    const model = provider?.models?.[selection.index];
    return provider && model ? (
      <ModelDetail
        config={modelConfig.config}
        key={`${selection.providerName}-${selection.index}`}
        model={model}
        onChange={(next) =>
          modelConfig.updateModel(
            selection.providerName,
            selection.index,
            next,
          )
        }
        onDelete={() =>
          modelConfig.removeModel(selection.providerName, selection.index)
        }
        providerName={selection.providerName}
      />
    ) : null;
  }

  if (selection.type === "oauth") {
    const provider = modelConfig.oauthProviders.find(
      (candidate) => candidate.id === selection.providerId,
    );
    return provider ? <OAuthDetail key={provider.id} provider={provider} /> : null;
  }

  const provider = modelConfig.apiKeyProviders.find(
    (candidate) => candidate.id === selection.providerId,
  );
  return provider ? (
    <ApiKeyDetail
      key={provider.id}
      onRefresh={() => modelConfig.refreshApiKeyProvider(provider.id)}
      provider={provider}
    />
  ) : null;
}

function EmptySelection() {
  const { t } = useI18n();
  return (
    <Empty
      className="my-auto"
      description={t.models.selectProviderOrModel}
      image={Empty.PRESENTED_IMAGE_SIMPLE}
    />
  );
}
