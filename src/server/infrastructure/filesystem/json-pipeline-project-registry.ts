import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  PipelineProjectRegistration,
  PipelineProjectRegistry,
} from "@/server/ports/pipeline-project-registry";

type StoredRegistry = {
  version: 1;
  projects: PipelineProjectRegistration[];
};

export class JsonPipelineProjectRegistry implements PipelineProjectRegistry {
  constructor(private readonly filePath: string) {}

  async list(): Promise<PipelineProjectRegistration[]> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.filePath, "utf8")) as Partial<StoredRegistry>;
      if (!Array.isArray(parsed.projects)) return [];
      return parsed.projects.filter(isRegistration);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async get(projectId: string): Promise<PipelineProjectRegistration | null> {
    return (await this.list()).find((item) => item.projectId === projectId) ?? null;
  }

  async upsert(registration: PipelineProjectRegistration): Promise<void> {
    const rootKey = pathKey(registration.rootPath);
    const current = await this.list();
    const projects = current.filter((item) => (
      item.projectId !== registration.projectId && pathKey(item.rootPath) !== rootKey
    ));
    projects.push(registration);
    await this.write({ version: 1, projects });
  }

  async remove(projectId: string): Promise<boolean> {
    const current = await this.list();
    const projects = current.filter((item) => item.projectId !== projectId);
    if (projects.length === current.length) return false;
    await this.write({ version: 1, projects });
    return true;
  }

  private async write(value: StoredRegistry): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await fs.rename(temporary, this.filePath);
  }
}

function isRegistration(value: unknown): value is PipelineProjectRegistration {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PipelineProjectRegistration>;
  return typeof item.projectId === "string"
    && typeof item.rootPath === "string"
    && path.isAbsolute(item.rootPath)
    && typeof item.lastOpenedAt === "string";
}

function pathKey(value: string) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}
