import { promises as fs } from "node:fs";
import path from "node:path";
import { AppError } from "@/server/domain/app-error";
import type { PipelineSpecialistKind, PipelineSpecialistProfile } from "@/server/domain/pipeline-specialist";
import type { PipelineSpecialistProfileSource } from "@/server/ports/pipeline-specialist-profile-source";

const SETTINGS: Record<PipelineSpecialistKind, Pick<PipelineSpecialistProfile,
  "version" | "maxInputCharacters" | "maxOutputTokens" | "temperature" | "requestTimeoutMs">> = {
  script: { version: "1.1.0", maxInputCharacters: 48_000, maxOutputTokens: 8_000, temperature: 0.6, requestTimeoutMs: 300_000 },
  asset: { version: "1.1.0", maxInputCharacters: 48_000, maxOutputTokens: 4_000, temperature: 0.2, requestTimeoutMs: 120_000 },
  storyboard: { version: "1.2.0", maxInputCharacters: 56_000, maxOutputTokens: 12_000, temperature: 0.3, requestTimeoutMs: 300_000 },
  prompt: { version: "1.6.0", maxInputCharacters: 56_000, maxOutputTokens: 12_000, temperature: 0.1, requestTimeoutMs: 300_000 },
};

export class BundledPipelineSpecialistProfileSource implements PipelineSpecialistProfileSource {
  constructor(private readonly resourcesRoot: string) {}

  async get(kind: PipelineSpecialistKind): Promise<PipelineSpecialistProfile> {
    const directory = path.resolve(this.resourcesRoot, kind);
    try {
      const [systemPrompt, skillInstructions] = await Promise.all([
        fs.readFile(path.join(directory, "SYSTEM.md"), "utf8"),
        fs.readFile(path.join(directory, "SKILL.md"), "utf8"),
      ]);
      return { kind, ...SETTINGS[kind], systemPrompt, skillInstructions };
    } catch (cause) {
      throw new AppError("PIPELINE_SPECIALIST_PROFILE_NOT_FOUND", `The bundled ${kind} Specialist profile is unavailable`, 500, {
        cause: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }
}
