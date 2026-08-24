"use client";

import { PipelineStudioView } from "@/features/pipeline-studio/pipeline-studio-view";

export type PipelineStageId = "script" | "assets" | "storyboard" | "video" | "assembly";

export type ProjectDetailViewProps = {
  projectId: string;
  projectTitle: string;
  onBack: () => void;
};

export function ProjectDetailView({ projectId, projectTitle, onBack }: ProjectDetailViewProps) {
  return <PipelineStudioView projectId={projectId} projectTitle={projectTitle} onBack={onBack} />;
}
