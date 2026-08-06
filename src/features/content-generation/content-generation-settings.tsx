"use client";

import { Eye, EyeOff, KeyRound, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { GenerationRouteDto } from "@/contracts/generation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/use-i18n";
import {
  deleteRunningHubGenerationCredential,
  loadGenerationRoutes,
  loadRunningHubGenerationCredential,
  saveRunningHubGenerationCredential,
} from "./api";

export function ContentGenerationSettings({
  onDirtyChange,
}: {
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { t } = useI18n();
  const labels = t.contentGeneration;
  const [routes, setRoutes] = useState<GenerationRouteDto[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [hasCredential, setHasCredential] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let disposed = false;
    void Promise.all([
      loadRunningHubGenerationCredential(),
      loadGenerationRoutes(),
    ])
      .then(([credential, nextRoutes]) => {
        if (disposed) return;
        setHasCredential(credential.hasCredential);
        setRoutes(nextRoutes);
      })
      .catch((cause) => !disposed && setError(messageOf(cause)))
      .finally(() => !disposed && setLoading(false));
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    onDirtyChange?.(apiKey.length > 0);
  }, [apiKey, onDirtyChange]);

  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  async function saveCredential() {
    const value = apiKey.trim();
    if (!value || saving) return;
    setSaving(true);
    setError("");
    try {
      const status = await saveRunningHubGenerationCredential(value);
      setHasCredential(status.hasCredential);
      setApiKey("");
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setSaving(false);
    }
  }

  async function removeCredential() {
    if (saving || !window.confirm(labels.removeCredentialConfirm)) return;
    setSaving(true);
    setError("");
    try {
      const status = await deleteRunningHubGenerationCredential();
      setHasCredential(status.hasCredential);
      setApiKey("");
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setSaving(false);
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
                <div className="relative min-w-0 flex-1">
                  <Input
                    autoComplete="off"
                    className="pr-10"
                    disabled={loading || saving}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={hasCredential ? labels.apiKeyStored : labels.apiKeyPlaceholder}
                    type={showApiKey ? "text" : "password"}
                    value={apiKey}
                  />
                  <Button
                    aria-label={showApiKey ? labels.hideApiKey : labels.showApiKey}
                    className="absolute right-1 top-1/2 -translate-y-1/2"
                    onClick={() => setShowApiKey((value) => !value)}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    {showApiKey ? <EyeOff /> : <Eye />}
                  </Button>
                </div>
                <Button disabled={!apiKey.trim() || loading || saving} onClick={() => void saveCredential()} type="button">
                  {saving ? t.common.saving : t.common.save}
                </Button>
              </div>
            </label>
            {hasCredential ? (
              <Button className="mt-3" disabled={saving} onClick={() => void removeCredential()} size="sm" type="button" variant="ghost">
                <Trash2 />
                {labels.removeCredential}
              </Button>
            ) : null}
            {error ? <p className="mt-3 text-xs text-destructive-text" role="alert">{error}</p> : null}
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-primary">{labels.availableRoutes}</h3>
            <p className="mt-1 text-xs text-muted">{labels.availableRoutesDescription}</p>
          </div>
          <div className="divide-y divide-line-subtle rounded-lg border border-line-subtle">
            {loading ? <p className="p-4 text-xs text-muted">{t.common.loading}</p> : routes.map((route) => (
              <div className="flex items-center justify-between gap-4 p-4" key={route.id}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-primary">{route.name}</p>
                  <p className="mt-1 font-ui-mono text-caption text-muted">{route.capability}</p>
                </div>
                <span className="rounded border border-line-subtle px-2 py-1 text-caption text-muted">
                  {route.enabled ? labels.routeEnabled : labels.routeDisabled}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function messageOf(value: unknown) {
  return value instanceof Error ? value.message : "Request failed";
}
