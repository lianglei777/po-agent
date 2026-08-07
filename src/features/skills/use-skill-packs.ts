"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useI18n } from "@/i18n/use-i18n";
import {
  installSkillPack as installSkillPackApi,
  installSkillPackSource as installSkillPackSourceApi,
  loadSkillPacks,
  removeSkillPack as removeSkillPackApi,
  repairSkillPack as repairSkillPackApi,
  updateSkillPack as updateSkillPackApi,
} from "./api";
import { useSkillsStore } from "./state/skills-store-provider";
import type { SkillPackLoadResult } from "./types";
import type { PackMutation } from "./state/skills-store";

export function useSkillPacks(cwd: string) {
  const { t } = useI18n();
  const {
    applyPacksResult,
    packMutation,
    packsError,
    packsLoading,
    packsResult,
    selectedPackId,
    setPackMutation,
    setPacksError,
    setPacksLoading,
    setSelectedPackId,
  } = useSkillsStore((state) => state);
  const refreshRequestRef = useRef<AbortController | null>(null);
  const mutationRequestRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    refreshRequestRef.current?.abort();
    const controller = new AbortController();
    refreshRequestRef.current = controller;
    setPacksLoading(true);
    setPacksError(null);
    try {
      applyPacksResult(await loadSkillPacks(cwd, controller.signal));
    } catch (nextError) {
      if (!controller.signal.aborted) {
        setPacksError(errorMessage(nextError, t.skills.somethingWentWrong));
      }
    } finally {
      if (refreshRequestRef.current === controller) {
        refreshRequestRef.current = null;
        setPacksLoading(false);
      }
    }
  }, [
    applyPacksResult,
    cwd,
    setPacksError,
    setPacksLoading,
    t.skills.somethingWentWrong,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => {
      window.clearTimeout(timer);
      refreshRequestRef.current?.abort();
      mutationRequestRef.current?.abort();
    };
  }, [refresh]);

  const selectedPack = useMemo(
    () =>
      packsResult.packs.find((pack) => pack.packId === selectedPackId) ?? null,
    [packsResult.packs, selectedPackId],
  );

  const runMutation = useCallback(
    async (
      nextMutation: NonNullable<PackMutation>,
      request: (signal: AbortSignal) => Promise<SkillPackLoadResult>,
      onSuccess?: (next: SkillPackLoadResult) => void,
    ): Promise<boolean> => {
      if (mutationRequestRef.current) return false;
      refreshRequestRef.current?.abort();
      refreshRequestRef.current = null;
      setPacksLoading(false);
      const controller = new AbortController();
      mutationRequestRef.current = controller;
      setPackMutation(nextMutation);
      setPacksError(null);
      try {
        const next = await request(controller.signal);
        applyPacksResult(next);
        onSuccess?.(next);
        return true;
      } catch (nextError) {
        if (!controller.signal.aborted) {
          setPacksError(errorMessage(nextError, t.skills.somethingWentWrong));
        }
        return false;
      } finally {
        if (mutationRequestRef.current === controller) {
          mutationRequestRef.current = null;
          setPackMutation(null);
        }
      }
    },
    [
      applyPacksResult,
      setPackMutation,
      setPacksError,
      setPacksLoading,
      t.skills.somethingWentWrong,
    ],
  );

  const install = useCallback(
    (packId: string, scope: "global" | "project") =>
      runMutation({ operation: "install", packId }, (signal) =>
        installSkillPackApi({ packId, scope, cwd }, signal),
      ),
    [cwd, runMutation],
  );

  const installSource = useCallback(
    (source: string, scope: "global" | "project") =>
      runMutation(
        { operation: "install-source", packId: null },
        (signal) =>
          installSkillPackSourceApi({ source, scope, cwd }, signal),
        (next) => {
          const installed = next.packs.find(
            (pack) => pack.scope !== null && pack.source === source.trim(),
          );
          if (installed) setSelectedPackId(installed.packId);
        },
      ),
    [cwd, runMutation, setSelectedPackId],
  );

  const remove = useCallback(
    (packId: string) =>
      runMutation({ operation: "remove", packId }, (signal) =>
        removeSkillPackApi({ packId, cwd }, signal),
      ),
    [cwd, runMutation],
  );

  const update = useCallback(
    (packId: string) =>
      runMutation({ operation: "update", packId }, (signal) =>
        updateSkillPackApi({ packId, cwd }, signal),
      ),
    [cwd, runMutation],
  );

  const repair = useCallback(
    (packId: string) =>
      runMutation({ operation: "repair", packId }, (signal) =>
        repairSkillPackApi({ packId, cwd }, signal),
      ),
    [cwd, runMutation],
  );

  return {
    ...packsResult,
    busy: packMutation !== null,
    error: packsError,
    install,
    installSource,
    loading: packsLoading,
    mutation: packMutation,
    refresh,
    remove,
    repair,
    selectedPack,
    selectedPackId,
    setSelectedPackId,
    update,
  };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
