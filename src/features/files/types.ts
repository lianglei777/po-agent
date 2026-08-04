export type { FileEntry } from "@/contracts/files";

export interface OpenFile {
  name: string;
  path: string;
  contentType?: string;
}
