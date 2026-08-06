import { relativePath } from "./path";
import type { FileEntry } from "./types";

export type DisplayFileEntry = {
  entry: FileEntry;
  runName?: string;
};

export function isGeneratedArtifactsPath(cwd: string, path: string) {
  return relativePath(cwd, path).toLowerCase() === ".po-agent/generated";
}

export function compactGeneratedEntries({
  cwd,
  directoryPath,
  entries,
  entriesByPath,
}: {
  cwd: string;
  directoryPath: string;
  entries: FileEntry[];
  entriesByPath: Record<string, FileEntry[]>;
}): DisplayFileEntry[] {
  if (!isGeneratedArtifactsPath(cwd, directoryPath)) {
    return entries.map((entry) => ({ entry }));
  }

  return [...entries]
    .sort((left, right) => right.modified.localeCompare(left.modified))
    .flatMap((entry) => {
      if (!entry.isDir) return [{ entry }];

      const children = entriesByPath[entry.path];
      if (!children?.length || children.some((child) => child.isDir)) {
        return [{ entry }];
      }

      return [...children]
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((child) => ({ entry: child, runName: entry.name }));
    });
}
