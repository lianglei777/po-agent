export interface PipelineAgentConversationResponse {
  projectId: string;
  sessionId: string;
  provider: string | null;
  modelId: string | null;
  allowAgentGeneration: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpdatePipelineAgentConversationRequest {
  provider?: string;
  modelId?: string;
  allowAgentGeneration?: boolean;
}

export interface PipelineAgentTurnRequest {
  turnId: string;
  message: string;
  canvasRevision: number;
  selectedNodeIds: string[];
  mentionedNodeIds?: string[];
}

export type CanvasAgentStage =
  | "discuss"
  | "script"
  | "storyboard"
  | "canvas"
  | "generate"
  | "review";

export type CanvasAgentGenerationPermission =
  | "not-requested"
  | "allowed"
  | "project-disabled"
  | "denied-by-user";

interface CanvasAgentTurnIntentBase {
  objective: string;
  requestedStage: CanvasAgentStage;
  effectiveStage: CanvasAgentStage;
  allowedStages: CanvasAgentStage[];
  generationPermission: CanvasAgentGenerationPermission;
}

export type CanvasAgentTurnIntent =
  | (CanvasAgentTurnIntentBase & {
      type: "resolved";
      confidence: "high" | "medium";
    })
  | (CanvasAgentTurnIntentBase & {
      type: "clarification";
      confidence: "low";
      question: string;
    });

export interface PipelineAgentTurnResponse {
  accepted: true;
  intent: CanvasAgentTurnIntent;
}

export interface UndoCanvasAgentActionResponse {
  actionId: string;
  status: "undone";
}

export interface PipelineSkillLoadResponse {
  skills: SkillInfo[];
  diagnostics: SkillDiagnostic[];
}

export interface PipelineSkillMutationResponse extends PipelineSkillLoadResponse {
  sessionReloaded: boolean;
}

export interface UpdatePipelineSkillRequest {
  skillId: string;
  disabled: boolean;
  expectedVersion?: string;
}

export interface InstallPipelineSkillRequest {
  package: string;
}

export interface ImportPipelineSkillRequest {
  sourceFilePath: string;
}

export interface PipelineSkillSearchResponse {
  results: SkillSearchResult[];
}
import type {
  SkillInfo,
  SkillDiagnostic,
  SkillSearchResult,
} from "@/contracts/skills";
