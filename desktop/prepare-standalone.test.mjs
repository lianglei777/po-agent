import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { copyStandaloneStaticAssets } from "./prepare-standalone.mjs";

test("copies Next static assets into the standalone server directory", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "po-agent-static-"));
  try {
    const source = path.join(root, ".next", "static", "chunks");
    const target = path.join(root, ".next", "standalone", ".next", "static", "chunks");
    mkdirSync(source, { recursive: true });
    writeFileSync(path.join(source, "app.js"), "chunk", { flush: true });

    copyStandaloneStaticAssets(root);

    assert.equal(readFileSync(path.join(target, "app.js"), "utf8"), "chunk");
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("copies public assets when a public directory exists", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "po-agent-public-"));
  try {
    const source = path.join(root, "public");
    const target = path.join(root, ".next", "standalone", "public");
    mkdirSync(source, { recursive: true });
    writeFileSync(path.join(source, "logo.txt"), "asset", { flush: true });

    copyStandaloneStaticAssets(root);

    assert.equal(readFileSync(path.join(target, "logo.txt"), "utf8"), "asset");
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("copies bundled RunningHub API documentation", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "po-agent-runninghub-docs-"));
  try {
    const source = path.join(root, "docs", "RunningHubAPIs", "seedance2.0");
    const target = path.join(
      root,
      ".next",
      "standalone",
      "docs",
      "RunningHubAPIs",
      "seedance2.0",
    );
    mkdirSync(source, { recursive: true });
    writeFileSync(path.join(source, "text-to-video.md"), "# API 文档", { flush: true });

    copyStandaloneStaticAssets(root);

    assert.equal(
      readFileSync(path.join(target, "text-to-video.md"), "utf8"),
      "# API 文档",
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("copies production dependencies but excludes development-only dependencies", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "po-agent-runtime-deps-"));
  try {
    const productionPackage = path.join(root, "node_modules", "runtime-package");
    const developmentPackage = path.join(root, "node_modules", "dev-package");
    mkdirSync(productionPackage, { recursive: true });
    mkdirSync(developmentPackage, { recursive: true });
    mkdirSync(path.join(root, ".next", "standalone"), { recursive: true });
    writeFileSync(path.join(productionPackage, "index.js"), "runtime", { flush: true });
    writeFileSync(path.join(developmentPackage, "index.js"), "development", { flush: true });
    writeFileSync(
      path.join(root, "package-lock.json"),
      JSON.stringify({
        packages: {
          "node_modules/runtime-package": {},
          "node_modules/dev-package": { dev: true },
        },
      }),
      { flush: true },
    );

    copyStandaloneStaticAssets(root);

    assert.equal(
      readFileSync(
        path.join(root, ".next", "standalone", "node_modules", "runtime-package", "index.js"),
        "utf8",
      ),
      "runtime",
    );
    assert.equal(
      existsSync(
        path.join(root, ".next", "standalone", "node_modules", "dev-package"),
      ),
      false,
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
