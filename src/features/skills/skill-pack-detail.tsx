"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Box,
  ShieldAlert,
} from "@/components/icons";
import { useState } from "react";
import { Alert, Button, Radio, Tag } from "antd";
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
import { packCopy, statusLabel } from "./skill-pack-list";
import type { SkillPackInfo } from "./types";

export function SkillPackDetail({
  pack,
  busy,
  onInstall,
  onRemove,
  onUpdate,
  onRepair,
  onBack,
  projectName,
}: {
  pack: SkillPackInfo;
  busy: boolean;
  onInstall: (scope: "global" | "project") => void;
  onRemove: () => void;
  onUpdate: () => void;
  onRepair: () => void;
  onBack: () => void;
  projectName: string;
}) {
  const { t } = useI18n();
  const copy = packCopy(pack);
  const configured = pack.scope !== null;
  const [confirmingInstall, setConfirmingInstall] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [scope, setScope] = useState<"global" | "project">("project");

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
          <SectionTitle>{t.skills.packs.tabPacks}</SectionTitle>
          <div className="mt-1 flex items-center gap-2">
            <Box className="size-5 text-accent-deep" />
            <h1 className="truncate text-lg font-semibold text-primary">
              {copy.name}
            </h1>
            <Tag
              color={pack.status === "installed" ? "success" : undefined}
              variant={pack.status === "installed" ? "filled" : "outlined"}
            >
              {statusLabel(pack.status, t.skills.packs)}
            </Tag>
            {pack.updateAvailable ? (
              <Tag variant="outlined">{t.skills.packs.updateAvailable}</Tag>
            ) : null}
          </div>
          <p className="mt-2 text-body-sm leading-5 text-muted">
            {copy.description || t.skills.noDescription}
          </p>
          {/* 操作按钮 */}
          <div className="mt-3 flex items-center gap-2">
            {pack.status === "available" ? (
              <Button
                disabled={busy}
                htmlType="button"
                onClick={() => {
                  setScope("project");
                  setConfirmingInstall(true);
                }}
                size="small"
              >
                {t.skills.packs.installAction}
              </Button>
            ) : null}
            {pack.status === "installed" && pack.canUpdate ? (
              <Button
                disabled={busy}
                htmlType="button"
                loading={busy}
                onClick={onUpdate}
                size="small"
              >
                {t.skills.packs.updateAction}
              </Button>
            ) : null}
            {pack.status === "broken" ? (
              <Button
                disabled={busy}
                htmlType="button"
                loading={busy}
                onClick={onRepair}
                size="small"
              >
                {t.skills.packs.repairAction}
              </Button>
            ) : null}
            {configured ? (
              <Button
                danger
                disabled={busy}
                htmlType="button"
                onClick={() => setConfirmingRemove(true)}
                size="small"
                type="primary"
              >
                {t.skills.packs.removeAction}
              </Button>
            ) : null}
          </div>
        </header>

        {/* 安装确认 Dialog */}
        <Dialog
          open={confirmingInstall}
          onOpenChange={(open) => !open && !busy && setConfirmingInstall(false)}
        >
          <DialogContent
            className="z-[1101] sm:max-w-[420px]"
            closeLabel={t.common.close}
            overlayClassName="z-[1100]"
          >
            <DialogHeader>
              <DialogTitle>{t.skills.packs.installTitle}</DialogTitle>
              <DialogDescription>
                {t.skills.packs.installDescription.replace("{name}", copy.name)}
              </DialogDescription>
            </DialogHeader>
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">
                {t.skills.packs.installScope}
              </legend>
              <Radio.Group
                className="grid gap-2"
                name="skill-pack-scope"
                onChange={(event) =>
                  setScope(event.target.value as "project" | "global")
                }
                options={(["project", "global"] as const).map((value) => ({
                  className: "ant-radio-card",
                  label: (
                    <>
                      <span className="block text-xs font-medium text-primary">
                        {value === "project"
                          ? t.skills.scopeProject.replace(
                              "{project}",
                              projectName,
                            )
                          : t.skills.scopeGlobal}
                      </span>
                      <span className="mt-0.5 block text-meta leading-4 text-muted">
                        {value === "project"
                          ? t.skills.scopeProjectDescription
                          : t.skills.scopeGlobalDescription}
                      </span>
                    </>
                  ),
                  value,
                }))}
                value={scope}
              />
            </fieldset>
            <Alert
              showIcon
              title={t.skills.packs.securityWarning}
              type="warning"
            />
            <DialogFooter>
              <Button
                disabled={busy}
                htmlType="button"
                onClick={() => setConfirmingInstall(false)}
              >
                {t.common.cancel}
              </Button>
              <Button
                aria-busy={busy || undefined}
                disabled={busy}
                htmlType="button"
                loading={busy}
                onClick={() => {
                  setConfirmingInstall(false);
                  onInstall(scope);
                }}
                type="primary"
              >
                {t.skills.packs.installAction}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 移除确认 Dialog */}
        <Dialog
          open={confirmingRemove}
          onOpenChange={(open) => !open && !busy && setConfirmingRemove(false)}
        >
          <DialogContent
            className="z-[1101] sm:max-w-[420px]"
            closeLabel={t.common.close}
            overlayClassName="z-[1100]"
          >
            <DialogHeader>
              <DialogTitle>{t.skills.packs.removeTitle}</DialogTitle>
              <DialogDescription>
                {t.skills.packs.removeDescription.replace("{name}", copy.name)}
              </DialogDescription>
            </DialogHeader>
            <Alert
              showIcon
              title={t.skills.packs.securityWarning}
              type="warning"
            />
            <DialogFooter>
              <Button
                disabled={busy}
                htmlType="button"
                onClick={() => setConfirmingRemove(false)}
              >
                {t.common.cancel}
              </Button>
              <Button
                aria-busy={busy || undefined}
                danger
                disabled={busy}
                htmlType="button"
                loading={busy}
                onClick={() => {
                  setConfirmingRemove(false);
                  onRemove();
                }}
                type="primary"
              >
                {t.skills.packs.removeAction}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <SettingsSection title={t.skills.packs.basicInfo}>
          <SettingsRow compact label={t.skills.packs.status}>
            <span className="text-xs text-primary">
              {statusLabel(pack.status, t.skills.packs)}
            </span>
          </SettingsRow>
          <SettingsRow compact label={t.skills.scope}>
            <span className="text-xs text-primary">
              {scopeLabel(pack, projectName, t)}
            </span>
          </SettingsRow>
          <SettingsRow compact label={t.skills.packs.currentVersion}>
            <span className="font-ui-mono text-xs text-primary">
              {pack.version ?? t.skills.packs.versionUnknown}
            </span>
          </SettingsRow>
          <SettingsRow compact label={t.skills.packs.availableVersion}>
            <span className="font-ui-mono text-xs text-primary">
              {pack.availableVersion ?? t.skills.packs.versionUnknown}
            </span>
          </SettingsRow>
          <SettingsRow compact label={t.skills.source} contentMaxWidth={400}>
            <span className="break-all font-ui-mono text-xs text-primary">
              {pack.source}
            </span>
          </SettingsRow>
        </SettingsSection>

        {pack.status === "installed" && !pack.canUpdate ? (
          <p className="text-meta leading-4 text-muted">
            {t.skills.packs.localRefreshHint}
          </p>
        ) : null}

        <SettingsSection title={t.skills.packs.resources}>
          <div className="grid gap-4 p-4">
            <ResourceList
              label={t.skills.title}
              values={pack.resources.skills}
            />
            <ResourceList
              label={t.skills.packs.extensions}
              values={pack.resources.extensions}
            />
            <ResourceList
              label={t.skills.packs.prompts}
              values={pack.resources.prompts}
            />
            <ResourceList
              label={t.skills.packs.themes}
              values={pack.resources.themes}
            />
          </div>
        </SettingsSection>

        <SettingsSection title={t.skills.packs.securityNotice}>
          <div className="space-y-3 p-4">
            <Warning
              icon={<ShieldAlert />}
              text={t.skills.packs.securityWarning}
            />
            {pack.containsExtensions ? (
              <Warning
                icon={<AlertTriangle />}
                text={t.skills.packs.extensionWarning}
                strong
              />
            ) : null}
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}

function ResourceList({
  label,
  values,
}: {
  label: string;
  values: string[];
}) {
  const { t } = useI18n();
  return (
    <div className="rounded-lg border border-line-subtle bg-panel p-3">
      <h4 className="text-xs font-semibold text-muted">{label}</h4>
      {values.length ? (
        <ul className="mt-2 space-y-1 font-ui-mono text-xs">
          {values.map((value) => (
            <li className="break-all" key={value}>
              {value}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-dim">{t.skills.packs.noResources}</p>
      )}
    </div>
  );
}

function Warning({
  icon,
  text,
  strong = false,
}: {
  icon: React.ReactNode;
  text: string;
  strong?: boolean;
}) {
  return (
    <Alert
      icon={icon}
      showIcon
      title={text}
      type={strong ? "warning" : "info"}
    />
  );
}

function scopeLabel(
  pack: SkillPackInfo,
  projectName: string,
  t: ReturnType<typeof useI18n>["t"],
) {
  if (pack.scope === "project") {
    return t.skills.scopeProject.replace("{project}", projectName);
  }
  if (pack.scope === "user") return t.skills.scopeGlobal;
  return t.skills.packs.scopeNotInstalled;
}
