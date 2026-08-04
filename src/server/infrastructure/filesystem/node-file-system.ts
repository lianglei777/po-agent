import { createReadStream, promises as fs, watch as watchFile } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { AppError } from "@/server/domain/app-error";
import type { ByteRange } from "@/server/domain/workspace";
import type { WorkspaceFileService } from "@/server/ports/file-system";

const MAX_TEXT_SIZE = 256 * 1024;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const IGNORED_DIRECTORIES = new Set([".git", ".next", "node_modules"]);

export class NodeWorkspaceFileService implements WorkspaceFileService {
  async list(targetPath: string) {
    const stat = await safeStat(targetPath);
    if (!stat.isDirectory()) {
      throw new AppError("NOT_A_DIRECTORY", `${targetPath} is not a directory`, 400);
    }
    const entries = (await fs.readdir(targetPath, { withFileTypes: true }))
      .filter(
        (entry) =>
          !entry.isDirectory() || !IGNORED_DIRECTORIES.has(entry.name),
      );
    return Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(targetPath, entry.name);
        const entryStat = await fs.stat(entryPath);
        return {
          name: entry.name,
          path: entryPath,
          isDir: entry.isDirectory(),
          contentType: entry.isDirectory() ? "inode/directory" : mimeForPath(entryPath),
          size: entryStat.size,
          modified: entryStat.mtime.toISOString(),
        };
      }),
    );
  }

  async readText(targetPath: string) {
    const stat = await safeStat(targetPath);
    if (!stat.isFile()) {
      throw new AppError("NOT_A_FILE", `${targetPath} is not a file`, 400);
    }
    if (stat.size > MAX_TEXT_SIZE) {
      throw new AppError(
        "FILE_TOO_LARGE",
        `Text preview exceeds ${MAX_TEXT_SIZE} bytes`,
        413,
      );
    }
    return {
      content: await fs.readFile(targetPath, "utf8"),
      language: languageForPath(targetPath),
      size: stat.size,
    };
  }

  async getBinary(targetPath: string) {
    const stat = await safeStat(targetPath);
    if (!stat.isFile()) {
      throw new AppError("NOT_A_FILE", `${targetPath} is not a file`, 400);
    }
    const contentType = mimeForPath(targetPath);
    if (contentType.startsWith("image/") && stat.size > MAX_IMAGE_SIZE) {
      throw new AppError(
        "FILE_TOO_LARGE",
        `Image preview exceeds ${MAX_IMAGE_SIZE} bytes`,
        413,
      );
    }
    return {
      path: targetPath,
      size: stat.size,
      contentType,
      createStream: (range?: ByteRange) =>
        Readable.toWeb(
          createReadStream(targetPath, range ? range : undefined),
        ) as ReadableStream<Uint8Array>,
    };
  }

  async watch(
    targetPath: string,
    listener: (event: { type: "change" | "rename"; path: string }) => void,
  ): Promise<() => void> {
    await safeStat(targetPath);
    const watcher = watchFile(targetPath, (eventType, filename) => {
      listener({
        type: eventType,
        path: filename ? path.join(targetPath, filename.toString()) : targetPath,
      });
    });
    return () => watcher.close();
  }
}

async function safeStat(targetPath: string) {
  try {
    return await fs.stat(targetPath);
  } catch {
    throw new AppError("FILE_NOT_FOUND", `${targetPath} was not found`, 404);
  }
}

function languageForPath(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  return (
    {
      ".ts": "typescript",
      ".tsx": "typescript",
      ".js": "javascript",
      ".jsx": "javascript",
      ".json": "json",
      ".md": "markdown",
      ".css": "css",
      ".html": "html",
      ".py": "python",
      ".sh": "shell",
      ".ps1": "powershell",
    }[extension] ?? "text"
  );
}

function mimeForPath(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  return (
    {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".ogg": "audio/ogg",
      ".mp4": "video/mp4",
      ".webm": "video/webm",
      ".mov": "video/quicktime",
      ".m4v": "video/x-m4v",
      ".pdf": "application/pdf",
    }[extension] ?? "application/octet-stream"
  );
}
