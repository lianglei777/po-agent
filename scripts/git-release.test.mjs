import { test } from "node:test";
import assert from "node:assert/strict";
import { createGitReleaseCommands, tagForVersion } from "./git-release.mjs";

test("tagForVersion：生成稳定发布 Tag 并拒绝预发布版本", () => {
  assert.equal(tagForVersion("0.2.3"), "v0.2.3");
  assert.throws(() => tagForVersion("0.2.3-beta.1"), /无效版本号/);
});

test("createGitReleaseCommands：提交当前分支并一次推送分支和注释 Tag", () => {
  assert.deepEqual(createGitReleaseCommands("master", "0.2.3"), [
    ["git", ["add", "--all"]],
    ["git", ["commit", "-m", "chore(release): v0.2.3"]],
    ["git", ["tag", "-a", "v0.2.3", "-m", "Release v0.2.3"]],
    [
      "git",
      ["push", "origin", "HEAD:refs/heads/master", "refs/tags/v0.2.3"],
    ],
  ]);
  assert.throws(() => createGitReleaseCommands("", "0.2.3"), /detached HEAD/);
});
