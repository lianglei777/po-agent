import path from "node:path";

export interface OfficialSkillPackDefinition {
  id: string;
  version: string;
  source: string;
  name: string;
  description: string;
  expectedSkills: string[];
  containsExtensions: boolean;
}

export function getOfficialSkillPacks(
  env: Record<string, string | undefined> = process.env,
  cwd = process.cwd(),
): OfficialSkillPackDefinition[] {
  const root = path.resolve(
    env.PO_AGENT_OFFICIAL_PACKS_DIR ??
      path.join(cwd, "resources", "official-packs"),
  );
  return [
    {
      id: "git-release-workflows",
      version: "1.0.0",
      source: path.join(root, "git-release-workflows"),
      name: "Git & Release Workflows",
      description:
        "Review release readiness and write evidence-based release notes.",
      expectedSkills: ["prepare-release", "write-release-notes"],
      containsExtensions: false,
    },
    {
      id: "content-generation",
      version: "1.0.0",
      source: path.join(root, "content-generation"),
      name: "Content Generation",
      description:
        "Generate images and videos from external Chat through optional Agent Skills.",
      expectedSkills: ["image-generation", "video-generation"],
      containsExtensions: false,
    },
  ];
}
