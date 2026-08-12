"use client";

import { useCallback, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  shouldConfirmWorkspaceNavigation,
  type WorkspaceView,
} from "../workspace-navigation";
import { useWorkspaceStore } from "./workspace-store-provider";

export function useWorkspaceNavigationGuard() {
  const {
    activeView,
    modelProviderDirty,
    contentGenerationDirty,
    webAccessDirty,
    systemPromptDirty,
    projectInstructionsDirty,
    projectInstructionsOpen,
    discardNavigationChanges,
  } = useWorkspaceStore(
    useShallow((state) => ({
      activeView: state.activeView,
      modelProviderDirty: state.modelProviderDirty,
      contentGenerationDirty: state.contentGenerationDirty,
      webAccessDirty: state.webAccessDirty,
      systemPromptDirty: state.systemPromptDirty,
      projectInstructionsDirty: state.projectInstructionsDirty,
      projectInstructionsOpen: state.projectInstructionsOpen,
      discardNavigationChanges: state.discardNavigationChanges,
    })),
  );
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const pendingNavigationRef = useRef<(() => void) | null>(null);

  const requestNavigation = useCallback(
    (targetView: WorkspaceView, action: () => void) => {
      if (projectInstructionsOpen && projectInstructionsDirty) {
        pendingNavigationRef.current = action;
        setConfirmingDiscard(true);
        return;
      }
      if (
        shouldConfirmWorkspaceNavigation(
          activeView,
          targetView,
          modelProviderDirty ||
            contentGenerationDirty ||
            webAccessDirty ||
            systemPromptDirty,
        )
      ) {
        pendingNavigationRef.current = action;
        setConfirmingDiscard(true);
        return;
      }
      action();
    },
    [
      activeView,
      contentGenerationDirty,
      webAccessDirty,
      modelProviderDirty,
      projectInstructionsDirty,
      projectInstructionsOpen,
      systemPromptDirty,
    ],
  );

  const cancelDiscard = useCallback(() => {
    pendingNavigationRef.current = null;
    setConfirmingDiscard(false);
  }, []);

  const confirmDiscard = useCallback(() => {
    const action = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    discardNavigationChanges();
    setConfirmingDiscard(false);
    action?.();
  }, [discardNavigationChanges]);

  return {
    confirmingDiscard,
    instructionChangesDirty: projectInstructionsDirty || systemPromptDirty,
    requestNavigation,
    cancelDiscard,
    confirmDiscard,
  };
}
