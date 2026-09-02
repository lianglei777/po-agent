#!/usr/bin/env node
// 本地认证验证必须模拟 production；子进程环境隔离，不能污染调用者的终端或真实 Pi 数据目录。
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LOGIN_TEST_PORT = 51733;

export function loginTestDataDirectory(root) {
  return path.join(root, ".po-agent-login-test");
}

export function loginTestEnvironment(root, environment = process.env) {
  return {
    ...environment,
    NODE_ENV: "production",
    PI_CODING_AGENT_DIR: loginTestDataDirectory(root),
  };
}

export function loginTestStartArguments() {
  return ["run", "start", "--", "-p", String(LOGIN_TEST_PORT), "-H", "127.0.0.1"];
}

export function npmCommand(platform = process.platform) {
  return platform === "win32" ? "npm.cmd" : "npm";
}

export function startLoginTest(root, options = {}) {
  const spawnCommand = options.spawnCommand ?? spawn;
  return spawnCommand(
    npmCommand(options.platform),
    loginTestStartArguments(),
    {
      cwd: root,
      env: loginTestEnvironment(root, options.environment),
      stdio: "inherit",
    },
  );
}

function main() {
  const root = path.resolve(fileURLToPath(import.meta.url), "..", "..");
  const child = startLoginTest(root);
  child.once("error", (error) => {
    console.error(`无法启动本地登录测试：${error.message}`);
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    if (signal) {
      console.error(`本地登录测试被信号 ${signal} 终止。`);
      process.exitCode = 1;
    } else {
      process.exitCode = code ?? 1;
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
