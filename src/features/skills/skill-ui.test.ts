import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const detailSource = readFileSync(
  fileURLToPath(new URL("./skill-detail.tsx", import.meta.url)),
  "utf8",
);
const listSource = readFileSync(
  fileURLToPath(new URL("./skill-list.tsx", import.meta.url)),
  "utf8",
);
const hookSource = readFileSync(
  fileURLToPath(new URL("./use-skills.ts", import.meta.url)),
  "utf8",
);
const pageSource = readFileSync(
  fileURLToPath(new URL("./skills-page.tsx", import.meta.url)),
  "utf8",
);
const packHookSource = readFileSync(
  fileURLToPath(new URL("./use-skill-packs.ts", import.meta.url)),
  "utf8",
);
const packDetailSource = readFileSync(
  fileURLToPath(new URL("./skill-pack-detail.tsx", import.meta.url)),
  "utf8",
);
const addPackSource = readFileSync(
  fileURLToPath(new URL("./add-skill-pack-dialog.tsx", import.meta.url)),
  "utf8",
);
const skillListSource = readFileSync(
  fileURLToPath(new URL("./skill-list.tsx", import.meta.url)),
  "utf8",
);

describe("skills config UI contract", () => {
  it("describes model invocation instead of whole-skill enablement", () => {
    expect(listSource).toContain("t.skills.modelInvocationAllowed");
    expect(listSource).toContain("t.skills.manualInvocationOnly");
    expect(listSource).not.toContain("CircleSlash2");
  });

  it("uses the Ant switch and explains read-only state", () => {
    expect(detailSource).toContain(
      'import { Button, Switch, Tooltip } from "antd"',
    );
    expect(detailSource).toContain("<Switch");
    expect(detailSource).toContain("onChange={onToggle}");
    expect(detailSource).toContain("<Tooltip");
    expect(detailSource).toContain("t.skills.readOnlySymlink");
  });

  it("labels package groups with their package source", () => {
    expect(listSource).toContain("packageSourceLabel(group.detail)");
    expect(listSource).not.toContain(
      "sourceLabel(group.detail, group.origin, t.skills)",
    );
  });

  it("uses Ant Design tags directly for skill metadata", () => {
    expect(skillListSource).toContain('import { Tag } from "antd"');
    expect(skillListSource).toContain('<Tag className="shrink-0" variant="outlined">');
    expect(packDetailSource).toContain(
      'import { Alert, Button, Radio, Tag } from "antd"',
    );
    expect(packDetailSource).not.toContain("<Badge");
  });

  it("does not offer standalone mutations for package-owned skills", () => {
    expect(detailSource).toContain("isManagedSkill(skill)");
    expect(detailSource).toContain("t.skills.managedByPack");
    expect(detailSource).toContain("!managed &&");
    expect(detailSource).toContain("onViewPack");
    expect(detailSource).toContain("t.skills.packs.viewPack");
  });

  it("does not let list refreshes abort skill mutations", () => {
    const refreshStart = hookSource.indexOf("const refresh");
    const refreshEnd = hookSource.indexOf("useEffect", refreshStart);
    const refreshSource = hookSource.slice(refreshStart, refreshEnd);
    expect(hookSource).toContain("refreshRequestRef");
    expect(hookSource).toContain("mutationRequestRef");
    expect(refreshSource).toContain("if (mutationRequestRef.current) return");
    expect(refreshSource).not.toContain("setSavingSkillId(null)");
    expect(pageSource).toContain("skills.loading || skills.busy");
  });

  it("clears an interrupted refresh when saving", () => {
    const toggleStart = hookSource.indexOf("const toggleModelInvocation");
    const toggleEnd = hookSource.indexOf("return {", toggleStart);
    expect(hookSource.slice(toggleStart, toggleEnd)).toContain(
      "setSkillsLoading(false)",
    );
  });

  it("selects the installed skill and returns to its details", () => {
    expect(pageSource).toContain("result.skills[0]?.skillId");
    expect(pageSource).toContain("skills.setSelectedSkillId");
    expect(pageSource).toContain('setScreen("skill-detail")');
    expect(pageSource).toContain("skills.refresh()");
  });

  it("makes project and global installation scope explicit", () => {
    const addSource = readFileSync(
      fileURLToPath(new URL("./add-skill-panel.tsx", import.meta.url)),
      "utf8",
    );
    expect(addSource).toContain(
      'import { Alert, Button, Empty, Input, Radio, Segmented, Tag } from "antd"',
    );
    expect(addSource).toContain("t.skills.scopeProject");
    expect(addSource).toContain("t.skills.scopeGlobal");
    expect(addSource).toContain("t.skills.scopeGlobalDescription");
    expect(addSource).toContain("projectName");
    expect(addSource).toContain("<Radio.Group");
    expect(addSource).toContain('<Segmented<"market" | "local">');
  });

  it("labels every diagnostic severity with semantic color", () => {
    expect(pageSource).toContain(
      "t.skills.diagnosticSeverity[diagnostic.severity]",
    );
    expect(pageSource).toContain('"text-warning"');
    expect(pageSource).toContain('"text-destructive-text"');
    expect(pageSource).toContain('"text-primary"');
  });

  it("does not let list refreshes abort package mutations", () => {
    expect(packHookSource).toContain("refreshRequestRef");
    expect(packHookSource).toContain("mutationRequestRef");
  });

  it("shows versions and only valid lifecycle actions", () => {
    expect(packDetailSource).toContain("pack.version");
    expect(packDetailSource).toContain("pack.availableVersion");
    expect(packDetailSource).toContain("pack.canUpdate");
    expect(packDetailSource).toContain('pack.status === "broken"');
    expect(packDetailSource).toContain("onUpdate");
    expect(packDetailSource).toContain("onRepair");
    expect(packDetailSource).toContain("onRemove");
  });

  it("provides one reviewed manual Package source form", () => {
    expect(addPackSource).toContain(
      'import { Alert, Button, Input, Radio } from "antd"',
    );
    expect(addPackSource).toContain("selectProjectDirectory");
    expect(addPackSource).toContain("installScope");
    expect(addPackSource).toContain("securityWarning");
    expect(addPackSource).toContain("source.trim()");
    expect(addPackSource).toContain("<Radio.Group");
    expect(addPackSource).toContain("<Alert");
  });

  it("keeps deliberate-close dialogs while migrating their standard controls", () => {
    expect(detailSource).toContain('from "@/components/ui/dialog"');
    expect(packDetailSource).toContain('from "@/components/ui/dialog"');
    expect(addPackSource).toContain('from "@/components/ui/dialog"');
    expect(packDetailSource).not.toContain('from "@/components/ui/button"');
    expect(addPackSource).not.toContain('from "@/components/ui/input"');
  });
});
