"use client";

import { CanvasStoreProvider } from "./state/canvas-store";
import { useCanvasController } from "./controllers/use-canvas-controller";
import { StudioCanvas } from "./components/studio-canvas";

export function PipelineStudioView({
  projectId,
  projectTitle,
  onBack,
}: {
  projectId: string;
  projectTitle: string;
  onBack: () => void;
}) {
  return (
    <CanvasStoreProvider projectId={projectId}>
      <PipelineStudioController projectId={projectId} projectTitle={projectTitle} onBack={onBack} />
    </CanvasStoreProvider>
  );
}

function PipelineStudioController({
  projectId,
  projectTitle,
  onBack,
}: {
  projectId: string;
  projectTitle: string;
  onBack: () => void;
}) {
  const controller = useCanvasController(projectId, projectTitle);
  return (
    <StudioCanvas
      projectId={projectId}
      projectTitle={controller.projectTitle}
      onBack={onBack}
      onRenameProject={controller.renameProject}
    />
  );
}
