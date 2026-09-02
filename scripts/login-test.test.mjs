import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  LOGIN_TEST_PORT,
  loginTestDataDirectory,
  loginTestEnvironment,
  loginTestStartArguments,
  npmCommand,
  startLoginTest,
} from "./login-test.mjs";
import { accessControlConfigPath, resetLoginTest } from "./reset-login-test.mjs";

test("login:test 使用隔离 Pi 数据目录和固定本机生产端口", () => {
  const root = path.join(path.sep, "workspace", "po-agent");
  const dataDirectory = loginTestDataDirectory(root);
  assert.equal(dataDirectory, path.join(root, ".po-agent-login-test"));
  assert.deepEqual(loginTestEnvironment(root, { KEEP: "value" }), {
    KEEP: "value",
    NODE_ENV: "production",
    PI_CODING_AGENT_DIR: dataDirectory,
  });
  assert.deepEqual(loginTestStartArguments(), [
    "run", "start", "--", "-p", String(LOGIN_TEST_PORT), "-H", "127.0.0.1",
  ]);
  assert.equal(npmCommand("win32"), "npm.cmd");
  assert.equal(npmCommand("linux"), "npm");
});

test("login:test 通过子进程传递环境而不修改父进程", () => {
  const root = path.join(path.sep, "workspace", "po-agent");
  let invocation;
  startLoginTest(root, {
    platform: "linux",
    environment: { ORIGINAL: "kept" },
    spawnCommand(command, args, options) {
      invocation = { command, args, options };
      return { once() {} };
    },
  });
  assert.equal(invocation.command, "npm");
  assert.deepEqual(invocation.args, loginTestStartArguments());
  assert.equal(invocation.options.cwd, root);
  assert.equal(invocation.options.env.ORIGINAL, "kept");
  assert.equal(invocation.options.env.PI_CODING_AGENT_DIR, loginTestDataDirectory(root));
});

test("login:test:reset 仅删除隔离目录中的认证配置", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "po-agent-login-test-"));
  try {
    const configPath = accessControlConfigPath(root);
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, "test-config");
    const preserved = path.join(root, "preserved.txt");
    fs.writeFileSync(preserved, "keep");

    await resetLoginTest(root, { portIsListening: async () => false });

    assert.equal(fs.existsSync(configPath), false);
    assert.equal(fs.readFileSync(preserved, "utf8"), "keep");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("login:test:reset 在测试服务运行时拒绝删除配置", async () => {
  await assert.rejects(
    resetLoginTest("/test-root", { portIsListening: async () => true }),
    /请先停止 npm run login:test/,
  );
});
