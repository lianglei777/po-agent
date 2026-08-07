"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
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
  } = useSkillsStore((state) => state);
  const requestRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setSavingSkillId(null);
    setSkillsLoading(true);
    setSkillsError(null);
    try {
      applySkillsResult(await loadSkills(cwd, controller.signal));
    } catch (nextError) {
      if (!controller.signal.aborted) {
        setSkillsError(errorMessage(nextError, t.skills.somethingWentWrong));
      }
    } finally {
      if (!controller.signal.aborted) setSkillsLoading(false);
    }
  }, [
    applySkillsResult,
    cwd,
    setSavingSkillId,
    setSkillsError,
    setSkillsLoading,
    t.skills.somethingWentWrong,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => {
      window.clearTimeout(timer);
      requestRef.current?.abort();
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
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
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
      if (!controller.signal.aborted) setSavingSkillId(null);
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
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
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
      if (!controller.signal.aborted) setRemovingSkillId(null);
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
