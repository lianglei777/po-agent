import { promises as fs } from "node:fs";
import path from "node:path";
import type { ContentGenerationState } from "@/server/domain/content-generation";
import type { ContentGenerationRepository } from "@/server/ports/content-generation-repository";

const EMPTY_STATE: ContentGenerationState = {
  version: 1,
  apis: [],
  sessions: [],
  jobs: [],
};

export class JsonContentGenerationRepository
  implements ContentGenerationRepository
{
  constructor(private readonly filePath: string) {}

  async read(): Promise<ContentGenerationState> {
    try {
      const parsed = JSON.parse(
        await fs.readFile(this.filePath, "utf8"),
      ) as Partial<ContentGenerationState>;
      return {
        version: 1,
        apis: Array.isArray(parsed.apis) ? parsed.apis : [],
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return structuredClone(EMPTY_STATE);
      }
      throw error;
    }
  }

  async write(state: ContentGenerationState): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await fs.rename(temporary, this.filePath);
  }

  async getApi(id: string) {
    return (await this.read()).apis.find((api) => api.id === id) ?? null;
  }

  async listSessions() {
    return (await this.read()).sessions;
  }

  async getSession(id: string) {
    return (await this.read()).sessions.find((session) => session.id === id) ?? null;
  }

  async getJob(id: string) {
    return (await this.read()).jobs.find((job) => job.id === id) ?? null;
  }
}
