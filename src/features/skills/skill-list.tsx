import { Bot, Terminal } from "@/components/icons";
import { Tag } from "antd";
import { useI18n } from "@/i18n/use-i18n";
import { groupSkills, packageSourceLabel } from "./skill-state";
import type { SkillInfo } from "./types";

export function SkillList({
  skills,
  selectedSkillId,
  onSelect,
  projectName,
}: {
  skills: SkillInfo[];
  selectedSkillId: string | null;
  onSelect: (skillId: string) => void;
  projectName: string;
}) {
  const { t } = useI18n();

  return (
    <div
      aria-label={t.skills.title}
      className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2"
      role="listbox"
    >
      {groupSkills(skills).map((group) => (
        <section aria-labelledby={`skill-group-${group.id}`} key={group.id}>
          <div className="px-2 pb-1 pt-3">
            <h3
              className="text-meta font-semibold uppercase tracking-[0.12em] text-dim"
              id={`skill-group-${group.id}`}
            >
              {group.id === "builtin"
                ? t.skills.builtIn
                : group.origin === "package"
                  ? `${t.skills.fromSkillPack}: ${packageSourceLabel(group.detail)}`
                  : groupLabel(group.scope, projectName, t)}
            </h3>
          </div>
          {group.skills.map((skill) => {
            const selected = skill.skillId === selectedSkillId;
            return (
              <button
                aria-selected={selected}
                className="mb-0.5 flex w-full items-center gap-[7px] rounded-md py-[5px] pl-2 pr-2 text-left hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
                key={skill.skillId}
                onClick={() => onSelect(skill.skillId)}
                role="option"
                style={{ background: selected ? "var(--bg-selected)" : undefined }}
                type="button"
              >
                <span
                  aria-label={
                    skill.disableModelInvocation
                      ? t.skills.manualInvocationOnly
                      : t.skills.modelInvocationAllowed
                  }
                  className="shrink-0"
                  role="img"
                  title={
                    skill.disableModelInvocation
                      ? t.skills.manualInvocationOnly
                      : t.skills.modelInvocationAllowed
                  }
                >
                  {skill.disableModelInvocation ? (
                    <Terminal className="size-3.5 text-dim" />
                  ) : (
                    <Bot className="size-3.5 text-accent-deep" />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {skill.name}
                  </span>
                  {group.origin === "package" ? (
                    <Tag className="shrink-0" variant="outlined">
                      {scopeLabel(skill.sourceInfo.scope, t)}
                    </Tag>
                  ) : null}
                </span>
              </button>
            );
          })}
        </section>
      ))}
    </div>
  );
}

function groupLabel(
  scope: SkillInfo["sourceInfo"]["scope"],
  projectName: string,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (scope === "project") {
    return t.skills.scopeProject.replace("{project}", projectName);
  }
  if (scope === "user") return t.skills.scopeGlobal;
  return t.skills.path;
}

function scopeLabel(
  scope: SkillInfo["sourceInfo"]["scope"],
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (scope === "project") return t.common.project;
  if (scope === "user") return t.common.global;
  return t.skills.builtIn;
}
