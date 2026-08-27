import { promises as fs } from "node:fs";
import path from "node:path";
import type { GenerationCredentialStore } from "@/server/ports/generation-provider";

interface CredentialFile {
  version: 1;
  credentials: Record<string, string>;
}

const EMPTY_FILE: CredentialFile = { version: 1, credentials: {} };

export class FileGenerationCredentialStore
  implements GenerationCredentialStore
{
  constructor(
    private readonly filePath: string,
    private readonly environment: Readonly<Record<string, string | undefined>> =
      process.env,
    private readonly credentialEnvironment: Readonly<Record<string, string>> = {},
  ) {}

  async getCredential(reference: string): Promise<string | null> {
    const stored = (await this.read()).credentials[reference]?.trim();
    if (stored) return stored;
    const environmentVariable = this.credentialEnvironment[reference];
    return environmentVariable
      ? this.environment[environmentVariable]?.trim() || null
      : null;
  }

  async hasCredential(reference: string): Promise<boolean> {
    return Boolean(await this.getCredential(reference));
  }

  async setCredential(reference: string, value: string): Promise<void> {
    const state = await this.read();
    const normalized = value.trim();
    if (normalized) state.credentials[reference] = normalized;
    else delete state.credentials[reference];
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(
      temporary,
      `${JSON.stringify(state, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    await fs.rename(temporary, this.filePath);
  }

  private async read(): Promise<CredentialFile> {
    try {
      const parsed = JSON.parse(
        await fs.readFile(this.filePath, "utf8"),
      ) as Partial<CredentialFile>;
      return {
        version: 1,
        credentials:
          parsed.version === 1 && parsed.credentials &&
          typeof parsed.credentials === "object" &&
          !Array.isArray(parsed.credentials)
            ? Object.fromEntries(
                Object.entries(parsed.credentials).filter(
                  (entry): entry is [string, string] =>
                    typeof entry[1] === "string",
                ),
              )
            : {},
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return structuredClone(EMPTY_FILE);
      }
      throw error;
    }
  }
}
