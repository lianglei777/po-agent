import { randomUUID } from "node:crypto";
import { AppError } from "@/server/domain/app-error";
import type {
  CanvasContinuityBible,
  CanvasContinuityCategory,
  CanvasContinuityEntry,
} from "@/server/domain/pipeline";
import type { PipelineRepository } from "@/server/ports/pipeline-repository";
import type { CanvasAgentTurnPolicyRegistry } from "./canvas-agent-turn-policy-registry";

export type CanvasContinuityOperation =
  | {
      type: "upsert";
      entryId?: string;
      category: CanvasContinuityCategory;
      label: string;
      value: string;
      sourceAnalysisIds?: string[];
      confirmationQuote: string;
    }
  | { type: "remove"; entryId: string; confirmationQuote: string };

export class CanvasContinuityService {
  constructor(
    private readonly repository: PipelineRepository,
    private readonly policies: CanvasAgentTurnPolicyRegistry,
  ) {}

  async update(input: {
    projectId: string;
    sessionId: string;
    operations: CanvasContinuityOperation[];
  }): Promise<CanvasContinuityBible> {
    this.policies.requireStage(input.sessionId, "discuss");
    if (!Array.isArray(input.operations) || !input.operations.length || input.operations.length > 20) {
      throw new AppError("VALIDATION_ERROR", "A continuity update must contain 1 to 20 operations", 400);
    }
    const active = this.policies.getActive(input.sessionId)!;
    if (active.intent.type !== "resolved") {
      throw new AppError("PIPELINE_AGENT_ACTION_NOT_ALLOWED", "Continuity cannot be changed during a clarification turn", 403);
    }
    const sourceAnalysisIds = [...new Set(input.operations.flatMap((operation) =>
      operation.type === "upsert" ? operation.sourceAnalysisIds ?? [] : []))];
    const sourceAnalyses = await Promise.all(sourceAnalysisIds.map((id) => this.repository.getCanvasAssetAnalysis(id)));
    if (sourceAnalyses.some((analysis) => !analysis || analysis.projectId !== input.projectId)) {
      throw new AppError("VALIDATION_ERROR", "A continuity source analysis was not found in this project", 400);
    }
    const current = await this.repository.getCanvasContinuityBible(input.projectId);
    const entries = [...(current?.entries ?? [])];
    for (const operation of input.operations) {
      requireConfirmationQuote(active.userMessage, operation.confirmationQuote);
      if (operation.type === "remove") {
        const index = entries.findIndex((entry) => entry.id === operation.entryId);
        if (index < 0) throw new AppError("VALIDATION_ERROR", "The continuity entry to remove was not found", 400);
        entries.splice(index, 1);
        continue;
      }
      if (!isCategory(operation.category)) {
        throw new AppError("VALIDATION_ERROR", "Unsupported continuity category", 400);
      }
      const now = new Date().toISOString();
      const label = bounded(operation.label, "label", 120);
      const value = bounded(operation.value, "value", 2_000);
      const index = operation.entryId
        ? entries.findIndex((entry) => entry.id === operation.entryId)
        : entries.findIndex((entry) => entry.category === operation.category && entry.label === label);
      const entry: CanvasContinuityEntry = {
        id: index >= 0 ? entries[index]!.id : randomUUID(),
        category: operation.category,
        label,
        value,
        sourceAnalysisIds: [...new Set(operation.sourceAnalysisIds ?? [])].slice(0, 20),
        confirmationQuote: operation.confirmationQuote.trim(),
        updatedAt: now,
      };
      if (index >= 0) entries[index] = entry;
      else entries.push(entry);
    }
    if (entries.length > 100) {
      throw new AppError("VALIDATION_ERROR", "A project can contain at most 100 continuity entries", 400);
    }
    const bible: CanvasContinuityBible = {
      projectId: input.projectId,
      revision: (current?.revision ?? 0) + 1,
      entries,
      updatedAt: new Date().toISOString(),
    };
    return this.repository.saveCanvasContinuityBible(bible);
  }
}

function requireConfirmationQuote(message: string, quote: string): void {
  const normalizedMessage = normalize(message);
  const normalizedQuote = normalize(quote);
  if (normalizedQuote.length < 2 || !normalizedMessage.includes(normalizedQuote)) {
    throw new AppError(
      "PIPELINE_AGENT_ACTION_NOT_ALLOWED",
      "Continuity facts can only be saved from words explicitly present in the current user message",
      403,
    );
  }
}

function normalize(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, "").toLocaleLowerCase();
}

function bounded(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new AppError("VALIDATION_ERROR", `Continuity ${field} is invalid`, 400);
  }
  return value.trim();
}

function isCategory(value: string): value is CanvasContinuityCategory {
  return value === "character" || value === "product" || value === "scene" ||
    value === "wardrobe" || value === "palette" || value === "style" || value === "camera";
}
