"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { loadSkills, removeSkill as removeSkillApi, setSkillModelInvocation } from "./api";
import { useI18n } from "@/i18n/use-i18n";
import { useSkillsStore } from "./state/skills-store-provider";

export function useSkills(cwd: string) {
  const { t } = useI18n();
  const {
    applySkillsResult,
    removingSkillId,
    savingSkillId,
    selectedSkillId,
    setRemovingSkillId,
    setSavingSkillId,
    setSelectedSkillId,
    setSkillsError,
    setSkillsLoading,
    skillsError,
    skillsLoading,
    skillsResult,
  } = useSkillsStore(
    useShallow(
      ({
        applySkillsResult,
        removingSkillId,
        savingSkillId,
        selectedSkillId,
        setRemovingSkillId,
        setSavingSkillId,
        setSelectedSkillId,
        setSkillsError,
        setSkillsLoading,
        skillsError,
        skillsLoading,
        skillsResult,
      }) => ({
        applySkillsResult,
        removingSkillId,
        savingSkillId,
        selectedSkillId,
        setRemovingSkillId,
        setSavingSkillId,
        setSelectedSkillId,
        setSkillsError,
        setSkillsLoading,
        skillsError,
        skillsLoading,
        skillsResult,
      }),
    ),
  );
  const refreshRequestRef = useRef<AbortController | null>(null);
  const mutationRequestRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    // 列表刷新不能取消已经发送到服务端的技能修改操作。
    if (mutationRequestRef.current) return;
    refreshRequestRef.current?.abort();
    const controller = new AbortController();
    refreshRequestRef.current = controller;
    setSkillsLoading(true);
    setSkillsError(null);
    try {
      applySkillsResult(await loadSkills(cwd, controller.signal));
    } catch (nextError) {
      if (!controller.signal.aborted) {
        setSkillsError(errorMessage(nextError, t.skills.somethingWentWrong));
      }
    } finally {
      if (refreshRequestRef.current === controller) {
        refreshRequestRef.current = null;
        setSkillsLoading(false);
      }
    }
  }, [
    applySkillsResult,
    cwd,
    setSkillsError,
    setSkillsLoading,
    t.skills.somethingWentWrong,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => {
      window.clearTimeout(timer);
      refreshRequestRef.current?.abort();
      mutationRequestRef.current?.abort();
    };
  }, [cwd, refresh]);

  const selectedSkill = useMemo(
    () =>
      skillsResult.skills.find((skill) => skill.skillId === selectedSkillId) ??
      null,
    [skillsResult.skills, selectedSkillId],
  );

  const toggleModelInvocation = useCallback(async () => {
    if (!selectedSkill) return;
    if (mutationRequestRef.current) return;
    refreshRequestRef.current?.abort();
    refreshRequestRef.current = null;
    const controller = new AbortController();
    mutationRequestRef.current = controller;
    setSkillsLoading(false);
    setSavingSkillId(selectedSkill.skillId);
    setSkillsError(null);
    try {
      applySkillsResult(
        await setSkillModelInvocation(
          {
            cwd,
            skillId: selectedSkill.skillId,
            disabled: !selectedSkill.disableModelInvocation,
            expectedVersion: selectedSkill.version,
          },
          controller.signal,
        ),
      );
    } catch (nextError) {
      if (!controller.signal.aborted) {
        setSkillsError(errorMessage(nextError, t.skills.somethingWentWrong));
      }
    } finally {
      if (mutationRequestRef.current === controller) {
        mutationRequestRef.current = null;
        setSavingSkillId(null);
      }
    }
  }, [
    applySkillsResult,
    cwd,
    selectedSkill,
    setSavingSkillId,
    setSkillsError,
    setSkillsLoading,
    t.skills.somethingWentWrong,
  ]);

  const removeSkill = useCallback(async (): Promise<boolean> => {
    if (!selectedSkill) return false;
    if (mutationRequestRef.current) return false;
    refreshRequestRef.current?.abort();
    refreshRequestRef.current = null;
    const controller = new AbortController();
    mutationRequestRef.current = controller;
    setSkillsLoading(false);
    setRemovingSkillId(selectedSkill.skillId);
    setSkillsError(null);
    try {
      applySkillsResult(
        await removeSkillApi(
          { skillId: selectedSkill.skillId, cwd },
          controller.signal,
        ),
      );
      return true;
    } catch (nextError) {
      if (!controller.signal.aborted) {
        setSkillsError(errorMessage(nextError, t.skills.somethingWentWrong));
      }
      return false;
    } finally {
      if (mutationRequestRef.current === controller) {
        mutationRequestRef.current = null;
        setRemovingSkillId(null);
      }
    }
  }, [
    applySkillsResult,
    cwd,
    selectedSkill,
    setRemovingSkillId,
    setSkillsError,
    setSkillsLoading,
    t.skills.somethingWentWrong,
  ]);

  return {
    ...skillsResult,
    busy: savingSkillId !== null || removingSkillId !== null,
    error: skillsError,
    loading: skillsLoading,
    refresh,
    removingSkillId,
    savingSkillId,
    selectedSkill,
    selectedSkillId,
    setSelectedSkillId,
    toggleModelInvocation,
    removeSkill,
  };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
