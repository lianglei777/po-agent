"use client";

import { useCallback, useEffect, useState } from "react";
import { loadAgentSettings, updateAgentSettings } from "./agent-settings-api";

type AgentSettingsError = "load" | "save" | null;

export function useAgentSettings() {
  const [autoCompactionEnabled, setAutoCompactionEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<AgentSettingsError>(null);

  useEffect(() => {
    let active = true;
    void loadAgentSettings()
      .then((settings) => {
        if (!active) return;
        setAutoCompactionEnabled(settings.autoCompactionEnabled);
        setError(null);
      })
      .catch(() => {
        if (active) setError("load");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const setAutoCompaction = useCallback(
    async (enabled: boolean) => {
      if (loading || saving) return false;
      const previous = autoCompactionEnabled;
      setAutoCompactionEnabled(enabled);
      setSaving(true);
      setError(null);
      try {
        const settings = await updateAgentSettings({
          autoCompactionEnabled: enabled,
        });
        setAutoCompactionEnabled(settings.autoCompactionEnabled);
        return true;
      } catch {
        setAutoCompactionEnabled(previous);
        setError("save");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [autoCompactionEnabled, loading, saving],
  );

  return {
    autoCompactionEnabled,
    error,
    loading,
    saving,
    setAutoCompaction,
  };
}
