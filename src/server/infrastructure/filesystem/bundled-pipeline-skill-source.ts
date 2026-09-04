import { promises as fs } from "node:fs";
import path from "node:path";
import { AppError } from "@/server/domain/app-error";
import type { PipelineBuiltinSkillSource } from "@/server/ports/pipeline-builtin-skill-source";

export class BundledPipelineSkillSource implements PipelineBuiltinSkillSource {
  constructor(private readonly resourcesRoot: string) {}

  async shortDrama(): Promise<string> {
    const source = path.resolve(this.resourcesRoot, "short-drama");
    const skillFile = path.join(source, "SKILL.md");
    try {
      await fs.access(skillFile);
    } catch {
      throw new AppError("SKILL_NOT_FOUND", "The bundled short-drama Skill is unavailable.", 404);
    }
    return source;
  }
}
