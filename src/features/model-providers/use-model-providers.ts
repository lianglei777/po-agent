"use client";

import { useCallback, useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  discoverModelsConfig,
  loadApiKeyProvider,
  loadModelsConfigData,
  saveModelsConfig,
} from "./api";
import { useI18n } from "@/i18n/use-i18n";
import { mergeDiscoveredModels } from "./model-discovery-merge";
import { isDialogDirty } from "./dialog-safety";
import { createDebouncedSaveQueue } from "./latest-save-queue";
import type {
  ModelDiscoverySuggestion,
  ModelEntry,
  ModelsJson,
  ProviderEntry,
} from "./types";
import { useModelProvidersStore } from "./state/model-providers-store-provider";

const AUTO_SAVE_DELAY_MS = 600;

export function useModelProviders(onSaved?: () => void) {
  const { t } = useI18n();
  const {
    config,
    setConfig,
    baselineConfig,
    setBaselineConfig,
    oauthProviders,
    setOauthProviders,
    apiKeyProviders,
    setApiKeyProviders,
    selection,
    setSelection,
    loading,
    setLoading,
    loadError,
    setLoadError,
    saving,
    setSaving,
    saveError,
    setSaveError,
    saveRetryAvailable,
    setSaveRetryAvailable,
    savedOk,
    setSavedOk,
    discovery,
    setDiscovery,
  } = useModelProvidersStore(
    useShallow(
      ({
        config,
        setConfig,
        baselineConfig,
        setBaselineConfig,
        oauthProviders,
        setOauthProviders,
        apiKeyProviders,
        setApiKeyProviders,
        selection,
        setSelection,
        loading,
        setLoading,
        loadError,
        setLoadError,
        saving,
        setSaving,
        saveError,
        setSaveError,
        saveRetryAvailable,
        setSaveRetryAvailable,
        savedOk,
        setSavedOk,
        discovery,
        setDiscovery,
      }) => ({
        config,
        setConfig,
        baselineConfig,
        setBaselineConfig,
        oauthProviders,
        setOauthProviders,
        apiKeyProviders,
        setApiKeyProviders,
        selection,
        setSelection,
        loading,
        setLoading,
        loadError,
        setLoadError,
        saving,
        setSaving,
        saveError,
        setSaveError,
        saveRetryAvailable,
        setSaveRetryAvailable,
        savedOk,
        setSavedOk,
        discovery,
        setDiscovery,
      }),
    ),
  );
  const configRef = useRef(config);
  const onSavedRef = useRef(onSaved);
  const failedToSaveRef = useRef(t.models.failedToSave);
  const savedTimerRef = useRef<number | null>(null);
  const saveQueueRef = useRef<ReturnType<
    typeof createDebouncedSaveQueue<ModelsJson>
  > | null>(null);

  useEffect(() => {
    configRef.current = config;
    onSavedRef.current = onSaved;
    failedToSaveRef.current = t.models.failedToSave;
  }, [config, onSaved, t.models.failedToSave]);

  useEffect(() => {
    const queue = createDebouncedSaveQueue<ModelsJson>({
      delayMs: AUTO_SAVE_DELAY_MS,
      save: saveModelsConfig,
      onScheduled: () => {
        setSavedOk(false);
        setSaveError(null);
        setSaveRetryAvailable(false);
      },
      onSavingChange: setSaving,
      onSaved: (savedConfig) => {
        setBaselineConfig(savedConfig);
        setSaveError(null);
        setSaveRetryAvailable(false);
        onSavedRef.current?.();
        if (isDialogDirty(savedConfig, configRef.current)) return;
        setSavedOk(true);
        if (savedTimerRef.current !== null) {
          window.clearTimeout(savedTimerRef.current);
        }
        savedTimerRef.current = window.setTimeout(() => {
          setSavedOk(false);
          savedTimerRef.current = null;
        }, 2_000);
      },
      onError: (error) => {
        setSaveError(toMessage(error, failedToSaveRef.current));
        setSaveRetryAvailable(true);
        setSavedOk(false);
      },
    });
    saveQueueRef.current = queue;
    return () => {
      queue.dispose();
      saveQueueRef.current = null;
      if (savedTimerRef.current !== null) {
        window.clearTimeout(savedTimerRef.current);
      }
    };
  }, [
    setBaselineConfig,
    setSaveError,
    setSaveRetryAvailable,
    setSavedOk,
    setSaving,
  ]);

  useEffect(() => {
    let active = true;
    loadModelsConfigData()
      .then((data) => {
        if (!active) return;
        setConfig(data.config);
        setBaselineConfig(data.config);
        setOauthProviders(data.oauthProviders);
        setApiKeyProviders(data.apiKeyProviders);
        const firstProvider = Object.keys(data.config.providers ?? {})[0];
        setSelection(
          firstProvider ? { type: "provider", name: firstProvider } : null,
        );
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadError(toMessage(error, t.models.failedToLoadConfig));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    setApiKeyProviders,
    setBaselineConfig,
    setConfig,
    setLoadError,
    setLoading,
    setOauthProviders,
    setSelection,
    t.models.failedToLoadConfig,
  ]);

  const addCustomProvider = useCallback(() => {
    const name = getUniqueProviderName(config.providers ?? {});
    setConfig((current) => ({
      ...current,
      providers: {
        ...(current.providers ?? {}),
        [name]: { api: "openai-completions" },
      },
    }));
    setSelection({ type: "provider", name });
    setDiscovery({ phase: "idle" });
  }, [config.providers, setConfig, setDiscovery, setSelection]);

  const renameProvider = useCallback(
    (oldName: string, requestedName: string) => {
      const newName = requestedName.trim();
      if (!newName || oldName === newName) return;
      if (config.providers?.[newName]) {
        setSaveError(`${t.models.providerExists}: "${newName}"`);
        setSaveRetryAvailable(false);
        return;
      }
      setSaveError(null);
      setSaveRetryAvailable(false);
      setConfig((current) => {
        const providers: Record<string, ProviderEntry> = {};
        for (const [name, provider] of Object.entries(
          current.providers ?? {},
        )) {
          providers[name === oldName ? newName : name] = provider;
        }
        return { ...current, providers };
      });
      setSelection((current) => {
        if (current?.type === "provider" && current.name === oldName) {
          return { type: "provider", name: newName };
        }
        if (current?.type === "model" && current.providerName === oldName) {
          return { ...current, providerName: newName };
        }
        return current;
      });
    },
    [
      config.providers,
      setConfig,
      setSaveError,
      setSaveRetryAvailable,
      setSelection,
      t.models.providerExists,
    ],
  );

  const deleteProvider = useCallback(
    (name: string) => {
      const providers = { ...(config.providers ?? {}) };
      delete providers[name];
      setConfig((current) => ({ ...current, providers }));
      const firstProvider = Object.keys(providers)[0];
      setSelection(
        firstProvider ? { type: "provider", name: firstProvider } : null,
      );
    },
    [config.providers, setConfig, setSelection],
  );

  const updateProvider = useCallback(
    (name: string, provider: ProviderEntry) => {
      setConfig((current) => ({
        ...current,
        providers: { ...(current.providers ?? {}), [name]: provider },
      }));
    },
    [setConfig],
  );

  const discoverProviderModels = useCallback(
    async (providerName: string) => {
      const provider = config.providers?.[providerName];
      if (!provider) return;
      setDiscovery({ phase: "discovering", providerName });
      try {
        const result = await discoverModelsConfig({ providerName, provider });
        setDiscovery({ phase: "result", providerName, ...result });
      } catch (error) {
        setDiscovery({
          phase: "error",
          providerName,
          message: toMessage(error, t.models.failedToDiscoverModels),
        });
      }
    },
    [config.providers, setDiscovery, t.models.failedToDiscoverModels],
  );

  const acceptDiscoveredModels = useCallback(
    (providerName: string, selected: ModelDiscoverySuggestion[]) => {
      if (
        discovery.phase !== "result" ||
        discovery.providerName !== providerName
      ) {
        return;
      }
      const result = mergeDiscoveredModels(
        config,
        providerName,
        selected,
      );
      setConfig(result.config);
      setSelection(result.selection);
      setDiscovery({
        ...discovery,
        models: discovery.models,
      });
    },
    [config, discovery, setConfig, setDiscovery, setSelection],
  );

  const updateModel = useCallback(
    (providerName: string, index: number, model: ModelEntry) => {
      setConfig((current) => {
        const provider = current.providers?.[providerName];
        if (!provider) return current;
        const models = [...(provider.models ?? [])];
        models[index] = model;
        return {
          ...current,
          providers: {
            ...(current.providers ?? {}),
            [providerName]: { ...provider, models },
          },
        };
      });
    },
    [setConfig],
  );

  const removeModel = useCallback((providerName: string, index: number) => {
    setConfig((current) => {
      const provider = current.providers?.[providerName];
      if (!provider) return current;
      const models = [...(provider.models ?? [])];
      models.splice(index, 1);
      return {
        ...current,
        providers: {
          ...(current.providers ?? {}),
          [providerName]: {
            ...provider,
            models: models.length ? models : undefined,
          },
        },
      };
    });
    setSelection({ type: "provider", name: providerName });
  }, [setConfig, setSelection]);

  const dirty = baselineConfig
    ? isDialogDirty(baselineConfig, config)
    : false;

  useEffect(() => {
    if (!dirty || loading || loadError) return;
    const queue = saveQueueRef.current;
    queue?.schedule(config);
    return () => queue?.cancelScheduled();
  }, [config, dirty, loadError, loading]);

  const retrySave = useCallback(() => {
    setSaveError(null);
    setSaveRetryAvailable(false);
    saveQueueRef.current?.saveNow(config);
  }, [config, setSaveError, setSaveRetryAvailable]);

  const refreshApiKeyProvider = useCallback(
    async (providerId: string) => {
      const current = apiKeyProviders.find(
        (provider) => provider.id === providerId,
      );
      if (!current) return;
      const updated = await loadApiKeyProvider(current, current.modelCount);
      setApiKeyProviders((providers) =>
        providers.map((provider) =>
          provider.id === providerId ? updated : provider,
        ),
      );
    },
    [apiKeyProviders, setApiKeyProviders],
  );

  return {
    config,
    dirty,
    oauthProviders,
    apiKeyProviders,
    selection,
    setSelection,
    loading,
    loadError,
    saving,
    saveError,
    saveRetryAvailable,
    savedOk,
    discovery,
    addCustomProvider,
    renameProvider,
    deleteProvider,
    updateProvider,
    discoverProviderModels,
    acceptDiscoveredModels,
    updateModel,
    removeModel,
    retrySave,
    refreshApiKeyProvider,
  };
}

function getUniqueProviderName(providers: Record<string, ProviderEntry>) {
  let name = "new-provider";
  let suffix = 1;
  while (name in providers) {
    name = `new-provider-${suffix}`;
    suffix += 1;
  }
  return name;
}

function toMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
