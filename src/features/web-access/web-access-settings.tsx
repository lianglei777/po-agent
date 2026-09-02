"use client";

import { ArrowDown, ArrowUp, Eye, EyeOff } from "@/components/icons";
import {
  WEB_SEARCH_FALLBACK_KINDS,
  type WebAccessSettingsResponse,
  type WebSearchProviderId,
} from "@/contracts/web-access";
import { useI18n } from "@/i18n/use-i18n";
import {
  Alert,
  App,
  Button,
  Checkbox,
  Input,
  Skeleton,
  Switch,
  Tooltip,
} from "antd";
import { useEffect, useRef, useState } from "react";
import { loadWebAccessSettings, saveWebAccessSettings } from "./api";

const AUTO_SAVE_DELAY_MS = 600;

const PROVIDER_NAMES: Record<WebSearchProviderId, string> = {
  brave: "Brave",
  tavily: "Tavily",
  exa: "Exa",
  duckduckgo: "DuckDuckGo",
};

export function WebAccessSettings({
  onDirtyChange,
}: {
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { t } = useI18n();
  const { message } = App.useApp();
  const labels = t.webAccess;
  const [settings, setSettings] = useState<WebAccessSettingsResponse | null>(
    null,
  );
  const [saved, setSaved] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let disposed = false;
    void loadWebAccessSettings()
      .then((value) => {
        if (disposed) return;
        setSettings(value);
        setSaved(JSON.stringify(value));
      })
      .catch((cause) => !disposed && setError(messageOf(cause)))
      .finally(() => !disposed && setLoading(false));
    return () => {
      disposed = true;
    };
  }, []);

  const revisionRef = useRef(0);
  const dirty = Boolean(settings && JSON.stringify(settings) !== saved);
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  useEffect(() => {
    if (!settings || !dirty) return;
    const snapshot = settings;
    const revision = ++revisionRef.current;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSaving(true);
      setError("");
      void saveWebAccessSettings(snapshot, controller.signal)
        .then((next) => {
          if (revision !== revisionRef.current) return;
          setSettings(next);
          setSaved(JSON.stringify(next));
          void message.success(t.common.settingsSaved);
        })
        .catch((cause) => {
          if (controller.signal.aborted || revision !== revisionRef.current) {
            return;
          }
          setError(messageOf(cause));
        })
        .finally(() => {
          if (revision === revisionRef.current) setSaving(false);
        });
    }, AUTO_SAVE_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [dirty, message, saved, settings, t.common.settingsSaved]);

  function updateProvider(
    id: WebSearchProviderId,
    update: { enabled?: boolean; apiKey?: string },
  ) {
    setSettings((current) =>
      current
        ? {
            ...current,
            providers: current.providers.map((provider) =>
              provider.id === id ? { ...provider, ...update } : provider,
            ),
          }
        : current,
    );
  }

  function moveProvider(index: number, offset: -1 | 1) {
    setSettings((current) => {
      if (!current) return current;
      const target = index + offset;
      if (target < 0 || target >= current.providers.length) return current;
      const providers = [...current.providers];
      [providers[index], providers[target]] = [
        providers[target],
        providers[index],
      ];
      return { ...current, providers };
    });
  }

  return (
    <main className="min-w-0 flex-1 overflow-y-auto px-10 py-8">
      <div className="mx-auto max-w-4xl">
        <header className="border-b border-line-subtle pb-5">
          <div>
            <h1 className="text-lg font-semibold tracking-[-0.02em] text-primary">
              {labels.title}
            </h1>
            <p className="mt-1 max-w-[65ch] text-body-sm leading-6 text-muted">
              {labels.description}
            </p>
          </div>
        </header>

        {loading ? (
          <Skeleton active className="py-6" paragraph={{ rows: 8 }} />
        ) : null}
        {!loading && settings ? (
          <div className="space-y-8 py-6">
            <section>
              <h2 className="text-sm font-semibold text-primary">
                {labels.enabled}
              </h2>
              <p className="mt-1 text-body-sm text-muted">
                {labels.enabledDescription}
              </p>
              <Switch
                aria-label={settings.enabled ? labels.disable : labels.enable}
                checked={settings.enabled}
                className="mt-3"
                disabled={saving}
                onChange={(enabled) => setSettings({ ...settings, enabled })}
              />
            </section>

            <section>
              <h2 className="text-sm font-semibold text-primary">
                {labels.providers}
              </h2>
              <p className="mt-1 text-body-sm text-muted">
                {labels.providersDescription}
              </p>
              <div className="mt-3 divide-y divide-line-subtle rounded-lg border border-line-subtle">
                {settings.providers.map((provider, index) => {
                  const keyOptional = provider.id === "exa";
                  const keyless = provider.id === "duckduckgo";
                  return (
                    <div
                      className="grid grid-cols-[132px_minmax(240px,1fr)_auto] items-center gap-4 px-4 py-3.5"
                      key={provider.id}
                    >
                      <div>
                        <p className="text-sm font-medium text-primary">
                          {PROVIDER_NAMES[provider.id]}
                        </p>
                        <p className="mt-0.5 text-meta text-muted">
                          {keyless
                            ? labels.noKeyRequired
                            : keyOptional
                              ? labels.keyOptional
                              : labels.keyRequired}
                        </p>
                      </div>
                      {keyless ? (
                        <span />
                      ) : (
                        <Input.Password
                          aria-label={`${PROVIDER_NAMES[provider.id]} API Key`}
                          autoComplete="off"
                          disabled={!settings.enabled || saving}
                          iconRender={(visible) =>
                            visible ? <EyeOff /> : <Eye />
                          }
                          onChange={(event) =>
                            updateProvider(provider.id, {
                              apiKey: event.target.value,
                            })
                          }
                          placeholder={labels.apiKeyPlaceholder}
                          value={provider.apiKey}
                        />
                      )}
                      <div className="flex items-center gap-2">
                        <Tooltip title={labels.moveUp}>
                          <span className="inline-flex">
                            <Button
                              aria-label={labels.moveUp}
                              disabled={!settings.enabled || index === 0 || saving}
                              icon={<ArrowUp />}
                              onClick={() => moveProvider(index, -1)}
                              shape="circle"
                              size="small"
                              type="text"
                            />
                          </span>
                        </Tooltip>
                        <Tooltip title={labels.moveDown}>
                          <span className="inline-flex">
                            <Button
                              aria-label={labels.moveDown}
                              disabled={!settings.enabled || index === settings.providers.length - 1 || saving}
                              icon={<ArrowDown />}
                              onClick={() => moveProvider(index, 1)}
                              shape="circle"
                              size="small"
                              type="text"
                            />
                          </span>
                        </Tooltip>
                        <Switch
                          aria-label={`${PROVIDER_NAMES[provider.id]} ${provider.enabled ? labels.providerEnabled : labels.providerDisabled}`}
                          checked={provider.enabled}
                          disabled={!settings.enabled || saving}
                          onChange={(enabled) =>
                            updateProvider(provider.id, { enabled })
                          }
                          size="small"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section>
              <h2 className="text-sm font-semibold text-primary">
                {labels.fallback}
              </h2>
              <p className="mt-1 text-body-sm text-muted">
                {labels.fallbackDescription}
              </p>
              <Checkbox.Group
                className="mt-3 flex flex-wrap gap-x-5 gap-y-2"
                disabled={!settings.enabled || saving}
                onChange={(fallbackOn) =>
                  setSettings({ ...settings, fallbackOn })
                }
                options={WEB_SEARCH_FALLBACK_KINDS.map((value) => ({
                  label: labels.fallbackKinds[value],
                  value,
                }))}
                value={settings.fallbackOn}
              />
            </section>
            {error ? <Alert showIcon title={error} type="error" /> : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}

function messageOf(value: unknown) {
  return value instanceof Error ? value.message : "Request failed";
}
