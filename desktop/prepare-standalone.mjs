import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function copyDirectoryIfExists(from, to) {
  if (!fs.existsSync(from)) return;
  fs.rmSync(to, { force: true, recursive: true });
  fs.cpSync(from, to, { recursive: true });
}

export function copyProductionRuntimeDependencies(root = process.cwd()) {
  const lockPath = path.join(root, "package-lock.json");
  const standaloneRoot = path.join(root, ".next", "standalone");
  if (!fs.existsSync(lockPath) || !fs.existsSync(standaloneRoot)) return;

  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  for (const [packagePath, metadata] of Object.entries(lock.packages ?? {})) {
    if (!isProductionPackagePath(packagePath, metadata)) continue;
    const source = path.join(root, packagePath);
    const target = path.join(standaloneRoot, packagePath);
    if (!fs.existsSync(source)) continue;
    // standalone 已包含的包直接覆盖为 npm 实际安装版本，确保动态 import 与普通 import 一致。
    fs.rmSync(target, { force: true, recursive: true });
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(source, target, { recursive: true });
  }
}

function isProductionPackagePath(packagePath, metadata) {
  if (!packagePath.startsWith("node_modules/")) return false;
  if (packagePath.split(/[\\/]/).includes("..")) return false;
  return !(metadata && typeof metadata === "object" && metadata.dev === true);
}

export function copyStandaloneStaticAssets(root = process.cwd()) {
  copyProductionRuntimeDependencies(root);
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
