import { describe, expect, it } from "vitest";
import type { FileEntry } from "./types";
import {
  compactGeneratedEntries,
  isGeneratedArtifactsPath,
} from "./file-tree-model";

function entry(
  path: string,
  options: Partial<FileEntry> = {},
): FileEntry {
  return {
    contentType: options.isDir ? "inode/directory" : "image/png",
    isDir: false,
    modified: "2026-08-06T10:00:00.000Z",
    name: path.split(/[\\/]/).at(-1) ?? path,
    path,
    size: 1,
    ...options,
  };
}

describe("file tree model", () => {
  it("recognizes the managed generation directory across path separators", () => {
    expect(
      isGeneratedArtifactsPath(
        "D:\\project",
        "D:\\project\\.po-agent\\generated",
      ),
    ).toBe(true);
    expect(isGeneratedArtifactsPath("/project", "/project/src")).toBe(false);
  });

  it("flattens completed generation runs while preserving their source id", () => {
    const olderRun = entry("D:\\project\\.po-agent\\generated\\older", {
      isDir: true,
      modified: "2026-08-05T10:00:00.000Z",
    });
    const latestRun = entry("D:\\project\\.po-agent\\generated\\latest", {
      isDir: true,
      modified: "2026-08-06T10:00:00.000Z",
    });
    const result = compactGeneratedEntries({
      cwd: "D:\\project",
      directoryPath: "D:\\project\\.po-agent\\generated",
      entries: [olderRun, latestRun],
      entriesByPath: {
        [olderRun.path]: [entry(`${olderRun.path}\\output-1.png`)],
        [latestRun.path]: [entry(`${latestRun.path}\\output-1.png`)],
      },
    });

    expect(result.map(({ runName }) => runName)).toEqual(["latest", "older"]);
    expect(result.every(({ entry: child }) => !child.isDir)).toBe(true);
  });

  it("keeps unloaded and nested runs as directories", () => {
    const run = entry("/project/.po-agent/generated/run", { isDir: true });
    const result = compactGeneratedEntries({
      cwd: "/project",
      directoryPath: "/project/.po-agent/generated",
      entries: [run],
      entriesByPath: {},
    });

    expect(result).toEqual([{ entry: run }]);
  });
});
