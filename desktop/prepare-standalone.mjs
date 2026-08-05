import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function copyDirectoryIfExists(from, to) {
  if (!fs.existsSync(from)) return;
  fs.rmSync(to, { force: true, recursive: true });
  fs.cpSync(from, to, { recursive: true });
}

export function copyStandaloneStaticAssets(root = process.cwd()) {
  copyDirectoryIfExists(
    path.join(root, ".next", "static"),
    path.join(root, ".next", "standalone", ".next", "static"),
  );
  copyDirectoryIfExists(
    path.join(root, "public"),
    path.join(root, ".next", "standalone", "public"),
  );
  copyDirectoryIfExists(
    path.join(root, "docs", "RunningHubAPIs"),
    path.join(root, ".next", "standalone", "docs", "RunningHubAPIs"),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  copyStandaloneStaticAssets();
}
