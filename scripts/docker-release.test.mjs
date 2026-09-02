import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  applyVersionToContent,
  createBuildArguments,
  nextVersion,
  restoreVersionFiles,
  updateVersionFiles,
} from "./docker-release.mjs";

test("nextVersion：patch/minor/major 与显式版本", () => {
  assert.equal(nextVersion("0.2.0", "patch"), "0.2.1");
  assert.equal(nextVersion("0.2.9", "minor"), "0.3.0");
  assert.equal(nextVersion("0.2.0", "major"), "1.0.0");
  assert.equal(nextVersion("0.2.0", "1.2.3"), "1.2.3");
  assert.throws(() => nextVersion("0.2.0", "hotfix"), /无效的版本参数/);
});

test("applyVersionToContent：替换 version 字段与镜像标签（含 -dev 前缀匹配）", () => {
  const pkg = `{\n  "name": "po-agent",\n  "version": "1.2.3"\n}\n`;
  const compose = `services:\n  po-agent:\n    image: po-agent:1.2.3\n`;
  const devCompose = `image: po-agent:1.2.3-dev\n`;

  const pkgResult = applyVersionToContent(pkg, "1.2.3", "1.3.0");
  assert.equal(pkgResult.count, 1);
  assert.ok(pkgResult.content.includes('"version": "1.3.0"'));

  const composeResult = applyVersionToContent(compose, "1.2.3", "1.3.0");
  assert.equal(composeResult.count, 1);
  assert.ok(composeResult.content.includes("po-agent:1.3.0"));
  assert.ok(!composeResult.content.includes("po-agent:1.2.3"));

  const devResult = applyVersionToContent(devCompose, "1.2.3", "1.3.0");
  assert.equal(devResult.count, 1);
  assert.equal(devResult.content, "image: po-agent:1.3.0-dev\n");
});

test("applyVersionToContent：零命中返回 count 0 且内容不变", () => {
  const content = "没有任何版本引用";
  const result = applyVersionToContent(content, "1.2.3", "1.3.0");
  assert.equal(result.count, 0);
  assert.equal(result.content, content);
});

function createFixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "po-agent-release-"));
  fs.writeFileSync(path.join(root, "package.json"), `{\n  "version": "1.2.3"\n}\n`);
  fs.writeFileSync(path.join(root, "docker-compose.yml"), `image: po-agent:1.2.3\n`);
  fs.writeFileSync(path.join(root, "docker-compose.dev.yml"), `image: po-agent:1.2.3-dev\n`);
  fs.mkdirSync(path.join(root, "docs", "operations"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "docs", "operations", "docker-deploy.md"),
    `docker build -t po-agent:1.2.3 .\n`,
  );
  return root;
}

test("updateVersionFiles：四个文件统一落盘并返回命中数", () => {
  const root = createFixtureRoot();
  const planned = updateVersionFiles(root, "1.2.3", "1.3.0");

  assert.equal(planned.length, 4);
  assert.ok(planned.every((p) => p.count >= 1));
  assert.match(fs.readFileSync(path.join(root, "package.json"), "utf8"), /"version": "1.3.0"/);
  assert.match(
    fs.readFileSync(path.join(root, "docker-compose.yml"), "utf8"),
    /po-agent:1\.3\.0/,
  );
  assert.match(
    fs.readFileSync(path.join(root, "docker-compose.dev.yml"), "utf8"),
    /po-agent:1\.3\.0-dev/,
  );
  assert.match(
    fs.readFileSync(path.join(root, "docs", "operations", "docker-deploy.md"), "utf8"),
    /po-agent:1\.3\.0/,
  );
});

test("updateVersionFiles：版本引用漂移时整体报错且不落盘", () => {
  const root = createFixtureRoot();
  // 人为制造漂移：doc 里没有版本引用
  fs.writeFileSync(
    path.join(root, "docs", "operations", "docker-deploy.md"),
    "文档内容已漂移\n",
  );

  assert.throws(() => updateVersionFiles(root, "1.2.3", "1.3.0"), /docker-deploy\.md/);
  // 原子性：报错后其他文件不能已被改动
  assert.match(fs.readFileSync(path.join(root, "package.json"), "utf8"), /"version": "1\.2\.3"/);
});

test("createBuildArguments：包含镜像标签和构建上下文", () => {
  assert.deepEqual(
    createBuildArguments("1.2.3", ["example/po-agent:1.2.3", "example/po-agent:latest"]),
    [
      "build",
      "--platform",
      "linux/amd64",
      "-t",
      "po-agent:1.2.3",
      "-t",
      "example/po-agent:1.2.3",
      "-t",
      "example/po-agent:latest",
      ".",
    ],
  );
});

test("restoreVersionFiles：构建失败时可恢复已更新的版本文件", () => {
  const root = createFixtureRoot();
  const planned = updateVersionFiles(root, "1.2.3", "1.3.0");
  restoreVersionFiles(planned);

  assert.match(fs.readFileSync(path.join(root, "package.json"), "utf8"), /"version": "1\.2\.3"/);
  assert.match(
    fs.readFileSync(path.join(root, "docker-compose.yml"), "utf8"),
    /po-agent:1\.2\.3/,
  );
});
