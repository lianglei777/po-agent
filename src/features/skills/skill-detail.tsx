"use client";

import { ArrowLeft, PackageOpen } from "@/components/icons";
import { useState } from "react";
import { Button, Switch, Tooltip } from "antd";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SectionTitle,
  SettingsRow,
  SettingsSection,
} from "@/components/ui/settings-form";
import { useI18n } from "@/i18n/use-i18n";
import { isManagedSkill, sourceLabel } from "./skill-state";
import type { SkillInfo } from "./types";

export function SkillDetail({
  skill,
  saving,
  removing,
  onToggle,
  onRemove,
  onViewPack,
  onBack,
  projectName,
}: {
  skill: SkillInfo;
  saving: boolean;
  removing: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onViewPack?: () => void;
  onBack: () => void;
  projectName: string;
}) {
  const enabled = !skill.disableModelInvocation;
  const managed = isManagedSkill(skill);
  const { t } = useI18n();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const canRemove =
    !managed &&
    (skill.sourceInfo.scope === "project" ||
      skill.sourceInfo.scope === "user");

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex w-full flex-col gap-5 px-4 py-4">
        <header>
          <Button
            className="-ml-2 mb-2"
            htmlType="button"
            icon={<ArrowLeft />}
            onClick={onBack}
            size="small"
            type="text"
          >
            {t.skills.backToList}
          </Button>
          <SectionTitle>{t.skills.title}</SectionTitle>
          <h1 className="mt-1 truncate font-ui-mono text-lg font-semibold text-primary">
            {skill.name}
          </h1>
          <p className="mt-1 text-body-sm leading-5 text-muted">
            {skill.description || t.skills.noDescription}
          </p>
        </header>

        <Dialog
          open={confirmingDelete}
          onOpenChange={(open) => !open && !removing && setConfirmingDelete(false)}
        >
          <DialogContent
            className="z-[1101] sm:max-w-[420px]"
            closeLabel={t.common.close}
            overlayClassName="z-[1100]"
          >
            <DialogHeader>
              <DialogTitle>{t.skills.removeConfirmTitle}</DialogTitle>
              <DialogDescription>
                {t.skills.removeConfirmDescription.replace("{name}", skill.name)}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                autoFocus
                disabled={removing}
                htmlType="button"
                onClick={() => setConfirmingDelete(false)}
              >
                {t.common.cancel}
              </Button>
              <Button
                aria-busy={removing || undefined}
                danger
                disabled={removing}
                htmlType="button"
                loading={removing}
                onClick={() => {
                  setConfirmingDelete(false);
                  onRemove();
                }}
                type="primary"
              >
                {t.skills.removeConfirmAction}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <SettingsSection title={t.skills.modelInvocation}>
          <SettingsRow
            compact
            label={t.skills.modelInvocation}
            description={
              <>
                {t.skills.modelInvocationDescription}{" "}
                <code>/skill:{skill.name}</code> {t.skills.calls}
              </>
            }
          >
            {managed ? (
              <div className="space-y-2 text-right">
                <p className="text-meta leading-4 text-muted">
                  {t.skills.managedByPack}
                </p>
                {onViewPack ? (
                  <Button
                    htmlType="button"
                    icon={<PackageOpen />}
                    onClick={onViewPack}
                    size="small"
                  >
                    {t.skills.packs.viewPack}
                  </Button>
                ) : null}
              </div>
            ) : (
              <Tooltip
                placement="top"
                title={
                  saving
                    ? t.common.saving
                    : skill.canModify
                      ? enabled
                        ? t.skills.modelInvocationAllowed
                        : t.skills.manualInvocationOnly
                      : t.skills.readOnlySymlink
                }
              >
                <span className="inline-flex shrink-0">
                  <Switch
                    aria-label={t.skills.allowModelInvocation}
                    checked={enabled}
                    disabled={saving || !skill.canModify}
                    loading={saving}
                    onChange={onToggle}
                  />
                </span>
              </Tooltip>
            )}
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title={t.skills.metadata}>
          <SettingsRow compact label={t.skills.source}>
            <span className="font-ui-mono text-xs text-primary">
              {sourceLabel(
                skill.sourceInfo.source,
                skill.sourceInfo.origin,
                t.skills,
              )}
            </span>
          </SettingsRow>
          <SettingsRow compact label={t.skills.scope}>
            <span className="text-xs text-primary">
              {scopeLabel(skill, projectName, t)}
            </span>
          </SettingsRow>
          <SettingsRow compact label={t.skills.path} contentMaxWidth={400}>
            <span className="break-all font-ui-mono text-xs text-primary">
              {skill.displayPath}
            </span>
          </SettingsRow>
        </SettingsSection>

        <p className="rounded-lg bg-hover px-3 py-2 text-meta leading-4 text-muted">
          {!managed && !skill.canModify
            ? `${t.skills.readOnlySymlink} `
            : ""}
          {t.skills.changesNotice}
        </p>

        {canRemove ? (
          <SettingsSection title={t.skills.dangerZone}>
            <SettingsRow
              compact
              label={t.skills.removeSkill}
              description={t.skills.removeSkillRowDescription}
            >
              <div className="flex justify-end">
                <Button
                  aria-label={t.skills.removeSkill}
                  danger
                  disabled={removing || saving}
                  htmlType="button"
                  loading={removing}
                  onClick={() => setConfirmingDelete(true)}
                  size="small"
                  type="primary"
                >
                  {t.skills.remove}
                </Button>
              </div>
            </SettingsRow>
          </SettingsSection>
        ) : null}
      </div>
    </div>
  );
}

function scopeLabel(
  skill: SkillInfo,
  projectName: string,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (skill.sourceInfo.scope === "project") {
    return t.skills.scopeProject.replace("{project}", projectName);
  }
  if (skill.sourceInfo.scope === "user") return t.skills.scopeGlobal;
  return t.skills.path;
}
