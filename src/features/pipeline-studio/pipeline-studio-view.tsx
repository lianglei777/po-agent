"use client";

import { CanvasStoreProvider } from "./state/canvas-store";
import { useCanvasController } from "./controllers/use-canvas-controller";
import { StudioCanvas } from "./components/studio-canvas";
import { PipelineAgentPanel } from "./agent-panel/pipeline-agent-panel";

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
    <div className="flex h-full min-w-0 flex-1">
      <StudioCanvas
        projectId={projectId}
        projectTitle={controller.projectTitle}
        onBack={onBack}
        onRenameProject={controller.renameProject}
      />
      <PipelineAgentPanel key={projectId} projectId={projectId} />
    </div>
  );
}
