"use client";

import { Folder, LoaderCircle } from "@/components/icons";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RadioCard } from "@/components/ui/radio-card";
import { useI18n } from "@/i18n/use-i18n";

export function AddSkillPackDialog({
  open,
  busy,
  onClose,
  onInstall,
  projectName,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onInstall: (
    source: string,
    scope: "global" | "project",
  ) => Promise<boolean>;
  projectName: string;
}) {
  const { t } = useI18n();
  const [source, setSource] = useState("");
  const [scope, setScope] = useState<"global" | "project">("project");
  const [desktopAvailable] = useState(
    () => typeof window !== "undefined" && Boolean(window.poAgentDesktop),
  );

  function close(force = false) {
    if (busy && !force) return;
    setSource("");
    setScope("project");
    onClose();
  }

  async function browse() {
    const selected = await window.poAgentDesktop?.selectProjectDirectory();
    if (selected) setSource(selected);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = source.trim();
    if (!normalized || busy) return;
    if (await onInstall(normalized, scope)) close(true);
  }

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close();
      }}
      open={open}
    >
      <DialogContent closeLabel={t.common.close}>
        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>{t.skills.packs.addTitle}</DialogTitle>
            <DialogDescription>
              {t.skills.packs.addDescription}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <label className="text-xs font-medium" htmlFor="skill-pack-source">
              {t.skills.packs.sourceLabel}
            </label>
            <div className="flex gap-2">
              <Input
                autoFocus
                className="font-ui-mono text-xs"
                id="skill-pack-source"
                onChange={(event) => setSource(event.target.value)}
                placeholder={t.skills.packs.sourcePlaceholder}
                value={source}
              />
              {desktopAvailable ? (
                <Button
                  aria-label={t.skills.packs.browse}
                  disabled={busy}
                  onClick={() => void browse()}
                  type="button"
                  variant="outline"
                >
                  <Folder />
                  {t.skills.packs.browse}
                </Button>
              ) : null}
            </div>
            <p className="text-xs leading-5 text-muted">
              {t.skills.packs.sourceHint}
            </p>
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">
              {t.skills.packs.installScope}
            </legend>
            {(["project", "global"] as const).map((value) => (
              <RadioCard
                checked={scope === value}
                key={value}
                name="manual-skill-pack-scope"
                onChange={() => setScope(value)}
                value={value}
              >
                <span className="block text-xs font-medium text-primary">
                  {value === "project"
                    ? t.skills.scopeProject.replace("{project}", projectName)
                    : t.skills.scopeGlobal}
                </span>
                <span className="mt-0.5 block text-meta leading-4 text-muted">
                  {value === "project"
                    ? t.skills.scopeProjectDescription
                    : t.skills.scopeGlobalDescription}
                </span>
              </RadioCard>
            ))}
          </fieldset>

          <p className="rounded-lg border border-warning/30 bg-warning/8 p-3 text-sm leading-5 text-warning">
            {t.skills.packs.securityWarning}
          </p>

          <DialogFooter>
            <Button
              disabled={busy}
              onClick={() => close()}
              type="button"
              variant="outline"
            >
              {t.common.cancel}
            </Button>
            <Button disabled={busy || !source.trim()} type="submit">
              {busy ? <LoaderCircle className="animate-spin" /> : null}
              {t.skills.packs.installAction}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
