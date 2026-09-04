import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function getFallbackAppDataDir() {
  if (process.platform === "win32") {
    return process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  }

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support");
  }

  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
}

export function getPiAgentDir(appDataPath) {
  const root = appDataPath || path.join(getFallbackAppDataDir(), "Po Agent");
  return path.join(root, "pi-agent");
}

export function getServerUrl(port) {
  return `http://127.0.0.1:${port}`;
}

export function getPackagedServerRoot(resourcesPath) {
  return path.join(resourcesPath, "server");
}

export function buildServerEnvironment({
  baseEnv = process.env,
  builtinSkillsDir,
  pipelineSkillsDir,
  officialPacksDir,
  piAgentDir,
  port,
}) {
  return {
    ...baseEnv,
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    HOSTNAME: "127.0.0.1",
    PORT: String(port),
    PI_CODING_AGENT_DIR: piAgentDir,
    PO_AGENT_BUILTIN_SKILLS_DIR: builtinSkillsDir,
    PO_AGENT_PIPELINE_SKILLS_DIR: pipelineSkillsDir,
    PO_AGENT_OFFICIAL_PACKS_DIR: officialPacksDir,
  };
}

export function getStandaloneServerPath(appRoot) {
  const packagedServer = path.join(appRoot, "server.js");
  if (fs.existsSync(packagedServer)) return packagedServer;

  return path.join(appRoot, ".next", "standalone", "server.js");
}

export function ensureDirectory(dir) {
  fs.mkdirSync(dir, { recursive: true });
}
