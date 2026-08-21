import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WorkspaceRootProvider } from "@/server/ports/file-system";
import { JsonPipelineProjectRegistry } from "./json-pipeline-project-registry";
import { LocalPipelineRepository } from "./local-pipeline-repository";

describe("LocalPipelineRepository", () => {
  let temporaryRoot: string;
  let registryPath: string;
  let roots: TestWorkspaceRoots;

  beforeEach(async () => {
    temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pipeline-local-"));
    registryPath = path.join(temporaryRoot, "agent", "pipeline-projects.json");
    roots = new TestWorkspaceRoots();
  });

  afterEach(async () => {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  });

  it("creates a self-contained project folder and indexes only its location", async () => {
    const projectRoot = path.join(temporaryRoot, "projects", "first-film");
    await fs.mkdir(path.dirname(projectRoot), { recursive: true });
    const repository = createRepository(registryPath, roots);

    const project = await repository.createProject(projectInput("project-1", projectRoot));

    expect(project.rootPath).toBe(await fs.realpath(projectRoot));
    await expect(fs.stat(path.join(projectRoot, ".pipeline-studio", "project.sqlite"))).resolves.toBeDefined();
    await expect(fs.stat(path.join(projectRoot, "assets", "imports"))).resolves.toBeDefined();
    await expect(fs.stat(path.join(projectRoot, "generated"))).resolves.toBeDefined();
    await expect(fs.stat(path.join(projectRoot, "exports"))).resolves.toBeDefined();
    const manifest = JSON.parse(await fs.readFile(
      path.join(projectRoot, ".pipeline-studio", "project.json"),
      "utf8",
    )) as { projectId: string };
    expect(manifest.projectId).toBe("project-1");
    expect(await roots.listRoots()).toContain(project.rootPath);
    await repository.deleteProject("project-1");
  });

  it("opens project data from its folder with a fresh repository instance", async () => {
    const projectRoot = path.join(temporaryRoot, "projects", "portable-film");
    await fs.mkdir(path.dirname(projectRoot), { recursive: true });
    const first = createRepository(registryPath, roots);
    await first.createProject(projectInput("project-2", projectRoot));
    await first.createCanvasNode({
      id: "node-1",
      projectId: "project-2",
      type: "text",
      entityId: "node-1",
      positionX: 10,
      positionY: 20,
    });

    const secondRegistryPath = path.join(temporaryRoot, "other-agent", "pipeline-projects.json");
    const second = createRepository(secondRegistryPath, new TestWorkspaceRoots());
    const opened = await second.openProject(projectRoot);

    expect(opened.id).toBe("project-2");
    await expect(second.listCanvasNodes("project-2")).resolves.toHaveLength(1);
    await second.deleteProject("project-2");
    await first.deleteProject("project-2");
  });

  it("removes a project from the index without deleting user files", async () => {
    const projectRoot = path.join(temporaryRoot, "projects", "keep-files");
    await fs.mkdir(path.dirname(projectRoot), { recursive: true });
    const repository = createRepository(registryPath, roots);
    await repository.createProject(projectInput("project-3", projectRoot));

    await expect(repository.deleteProject("project-3")).resolves.toBe(true);

    await expect(repository.listProjects()).resolves.toEqual([]);
    await expect(fs.stat(path.join(projectRoot, ".pipeline-studio", "project.json"))).resolves.toBeDefined();
  });

  it("does not create a database while opening an incomplete project folder", async () => {
    const projectRoot = path.join(temporaryRoot, "incomplete");
    const metadataRoot = path.join(projectRoot, ".pipeline-studio");
    await fs.mkdir(metadataRoot, { recursive: true });
    await fs.writeFile(path.join(metadataRoot, "project.json"), JSON.stringify({
      format: "po-agent-pipeline-project",
      formatVersion: 1,
      projectId: "missing-db",
      title: "Incomplete",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    const repository = createRepository(registryPath, roots);

    await expect(repository.openProject(projectRoot)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(fs.stat(path.join(metadataRoot, "project.sqlite"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});

function createRepository(registryPath: string, roots: WorkspaceRootProvider) {
  return new LocalPipelineRepository(new JsonPipelineProjectRegistry(registryPath), roots);
}

function projectInput(id: string, rootPath: string) {
  return {
    id,
    rootPath,
    title: "Portable film",
    originalText: "",
    artDirection: null,
    modelSettings: null,
    promptConfig: null,
    status: "draft" as const,
    coverArtifactId: null,
  };
}

class TestWorkspaceRoots implements WorkspaceRootProvider {
  private readonly roots = new Set<string>();

  async listRoots() {
    return [...this.roots];
  }

  addRoot(rootPath: string) {
    this.roots.add(rootPath);
  }
}
