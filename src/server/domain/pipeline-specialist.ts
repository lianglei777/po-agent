import type { CanvasMediaType } from "./pipeline";

export type PipelineSpecialistKind = "script" | "asset" | "storyboard" | "prompt";

export interface PipelineCreativeConstraints {
  language?: string;
  targetDurationSeconds?: number;
  aspectRatio?: string;
  audience?: string;
  platform?: string;
  tone?: string;
  preserveUserText: boolean;
}

export interface PipelineSpecialistRequest {
  projectId: string;
  sessionId: string;
  objective: string;
  sourceNodeIds: string[];
  targetNodeIds: string[];
  episodeKey?: string;
  constraints: PipelineCreativeConstraints;
}

export interface PipelineSpecialistProfile {
  kind: PipelineSpecialistKind;
  version: string;
  systemPrompt: string;
  skillInstructions: string;
  maxInputCharacters: number;
  maxOutputTokens: number;
  temperature: number;
}

export interface PipelineSpecialistWarning {
  code: string;
  message: string;
  nodeIds: string[];
  blocking: boolean;
}

export interface PipelineSpecialistPlanResult {
  kind: PipelineSpecialistKind;
  profileVersion: string;
  executionMode: "model" | "repaired" | "fallback";
  planId: string | null;
  status: "draft" | "no-change";
  summary: string;
  operationCount: number;
  affectedNodeIds: string[];
  warnings: PipelineSpecialistWarning[];
}

export interface PipelineSpecialistRouteContext {
  id: string;
  name: string;
  capability: string;
  mediaType: Exclude<CanvasMediaType, "text">;
  description: string;
  defaults: Record<string, unknown>;
  parameters: Array<{
    key: string;
    type: string;
    required: boolean;
    defaultValue?: unknown;
    optionValues?: unknown[];
    min?: number;
    max?: number;
  }>;
  assets: Array<{
    key: string;
    mediaType: CanvasMediaType;
    required: boolean;
    multiple: boolean;
    minFiles?: number;
    maxFiles?: number;
  }>;
}
