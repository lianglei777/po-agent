export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  contentType: string;
  size: number;
  modified: string;
}

export interface FileChangeEvent {
  type: "change" | "rename";
  path: string;
}

export type ListFilesResponse = FileEntry[];

export interface ReadTextFileResponse {
  content: string;
  language: string;
  size: number;
}

export type FileWatchEvent =
  | SseErrorEvent
  | { type: "connected"; path: string }
  | FileChangeEvent;
import type { SseErrorEvent } from "./common";
