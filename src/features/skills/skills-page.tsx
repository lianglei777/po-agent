"use client";

import {
  AlertTriangle,
  CheckCircle2,
  LoaderCircle,
  Plus,
  RefreshCw,
} from "@/components/icons";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useI18n } from "@/i18n/use-i18n";
import { AddSkillPanel } from "./add-skill-panel";
import { AddSkillPackDialog } from "./add-skill-pack-dialog";
import { SkillDetail } from "./skill-detail";
import { SkillList } from "./skill-list";
import { SkillPackDetail } from "./skill-pack-detail";
import { SkillPackList } from "./skill-pack-list";
import { findOwningSkillPack } from "./skill-state";
import type { SkillsView } from "./state/skills-store";
import {
  SkillsStoreProvider,
  useSkillsStore,
} from "./state/skills-store-provider";
import { useSkillPacks } from "./use-skill-packs";
import { useSkills } from "./use-skills";

type SkillsPageProps = {
  cwd: string;
  projectName: string;
};

export function SkillsPage(props: SkillsPageProps) {
  return (
    <SkillsStoreProvider>
      <SkillsPageContent {...props} />
    </SkillsStoreProvider>
  );
}

function SkillsPageContent({ cwd, projectName }: SkillsPageProps) {
  const {
    addingPack,
    packSuccess,
    removeSuccess,
    screen,
    selectView,
    setAddingPack,
    setPackSuccess,
    setRemoveSuccess,
    setScreen,
    setView,
    view,
  } = useSkillsStore(
    useShallow(
      ({
        addingPack,
        packSuccess,
        removeSuccess,
        screen,
        selectView,
        setAddingPack,
        setPackSuccess,
        setRemoveSuccess,
        setScreen,
        setView,
        view,
      }) => ({
        addingPack,
        packSuccess,
        removeSuccess,
        screen,
        selectView,
        setAddingPack,
        setPackSuccess,
        setRemoveSuccess,
        setScreen,
        setView,
        view,
      }),
    ),
  );
  const skills = useSkills(cwd);
  const packs = useSkillPacks(cwd);
  const { t } = useI18n();

  async function handleRemove() {
    if (!skills.selectedSkill) return;
    const skillName = skills.selectedSkill.name;
    setRemoveSuccess(null);
    const ok = await skills.removeSkill();
    if (ok) {
      setRemoveSuccess(`${t.skills.removed} ${skillName}.`);
      setScreen("list");
    }
  }

  async function handlePackInstall(scope: "global" | "project") {
    if (!packs.selectedPack) return;
    setPackSuccess(null);
    const ok = await packs.install(packs.selectedPack.packId, scope);
    if (ok) {
      setPackSuccess(t.skills.packs.installedSuccess);
      void skills.refresh();
    }
  }

  async function handlePackRemove() {
    if (!packs.selectedPack) return;
    setPackSuccess(null);
    const ok = await packs.remove(packs.selectedPack.packId);
    if (ok) {
      setPackSuccess(t.skills.packs.removedSuccess);
      setScreen("list");
      void skills.refresh();
    }
  }

  async function handlePackLifecycle(operation: "update" | "repair") {
    if (!packs.selectedPack) return;
    setPackSuccess(null);
    const ok = await packs[operation](packs.selectedPack.packId);
    if (ok) {
      setPackSuccess(
        operation === "update"
          ? t.skills.packs.updatedSuccess
          : t.skills.packs.repairedSuccess,
      );
      void skills.refresh();
    }
  }

  async function handleInstallSource(
    source: string,
    scope: "global" | "project",
  ) {
    const ok = await packs.installSource(source, scope);
    if (ok) {
      setPackSuccess(t.skills.packs.installedSuccess);
      setScreen("pack-detail");
      void skills.refresh();
    }
    return ok;
  }

  const removing = skills.removingSkillId === skills.selectedSkill?.skillId;
  const packBusy = packs.busy;
  const selectedSkillOwnerPack = skills.selectedSkill
    ? findOwningSkillPack(skills.selectedSkill, packs.packs)
    : undefined;
  const activeError = view === "skills" ? skills.error : packs.error;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-canvas">
      <div className="flex items-center gap-2 border-b border-line-subtle p-2">
        <SegmentedControl
          ariaLabel={t.skills.title}
          items={[
            { label: t.skills.packs.tabSkills, value: "skills" },
            { label: t.skills.packs.tabPacks, value: "packs" },
          ]}
          kind="radio"
          onValueChange={selectView}
          value={view}
        />
        {screen === "list" ? (
          <div className="ml-auto flex items-center gap-1">
            <Button
              aria-label={
                view === "skills" ? t.skills.addSkill : t.skills.packs.addAction
              }
              disabled={view === "packs" && packBusy}
              onClick={() =>
                view === "skills"
                  ? setScreen("add-skill")
                  : setAddingPack(true)
              }
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <Plus />
            </Button>
            <Button
              aria-label={
                view === "skills"
                  ? t.skills.refreshSkills
                  : t.skills.packs.refresh
              }
              disabled={
                view === "skills"
                  ? skills.loading || skills.busy
                  : packs.loading || packBusy
              }
              onClick={() =>
                void (view === "skills" ? skills.refresh() : packs.refresh())
              }
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <RefreshCw
                className={
                  (view === "skills" ? skills.loading : packs.loading)
                    ? "animate-spin"
                    : ""
                }
              />
            </Button>
          </div>
        ) : null}
      </div>

      {activeError ? (
        <div
          aria-live="polite"
          className="flex items-center justify-between gap-3 border-b border-destructive/25 bg-destructive/8 px-3 py-2 text-xs text-destructive-text"
          role="alert"
        >
          <span>{activeError}</span>
          <Button
            onClick={() =>
              void (view === "skills" ? skills.refresh() : packs.refresh())
            }
            size="sm"
            type="button"
            variant="ghost"
          >
            {t.common.retry}
          </Button>
        </div>
      ) : null}

      {removeSuccess && !removing ? (
        <SuccessBanner>{removeSuccess}</SuccessBanner>
      ) : null}
      {packSuccess && view === "packs" && !packBusy ? (
        <SuccessBanner>{packSuccess}</SuccessBanner>
      ) : null}

      {screen === "add-skill" ? (
        <AddSkillPanel
          cwd={cwd}
          onBack={() => setScreen("list")}
          onInstalled={(result) => {
            const installedSkillId = result.skills[0]?.skillId;
            if (installedSkillId) {
              skills.setSelectedSkillId(installedSkillId);
            }
            setScreen("skill-detail");
            void skills.refresh();
          }}
          projectName={projectName}
        />
      ) : screen === "skill-detail" && skills.selectedSkill ? (
        <SkillDetail
          onBack={() => setScreen("list")}
          onRemove={() => void handleRemove()}
          onToggle={() => void skills.toggleModelInvocation()}
          onViewPack={
            selectedSkillOwnerPack
              ? () => {
                  packs.setSelectedPackId(selectedSkillOwnerPack.packId);
                  setView("packs");
                  setScreen("pack-detail");
                }
              : undefined
          }
          projectName={projectName}
          removing={removing}
          saving={skills.savingSkillId === skills.selectedSkill.skillId}
          skill={skills.selectedSkill}
        />
      ) : screen === "pack-detail" && packs.selectedPack ? (
        <SkillPackDetail
          busy={packBusy}
          onBack={() => setScreen("list")}
          onInstall={(scope) => void handlePackInstall(scope)}
          onRemove={() => void handlePackRemove()}
          onRepair={() => void handlePackLifecycle("repair")}
          onUpdate={() => void handlePackLifecycle("update")}
          pack={packs.selectedPack}
          projectName={projectName}
        />
      ) : (
        <SkillsListView
          loading={view === "skills" ? skills.loading : packs.loading}
          onSelectPack={(packId) => {
            packs.setSelectedPackId(packId);
            setScreen("pack-detail");
          }}
          onSelectSkill={(skillId) => {
            skills.setSelectedSkillId(skillId);
            setScreen("skill-detail");
          }}
          packs={packs.packs}
          projectName={projectName}
          selectedPackId={packs.selectedPackId}
          selectedSkillId={skills.selectedSkillId}
          skills={skills.skills}
          view={view}
        />
      )}

      {screen === "list" &&
      view === "skills" &&
      skills.diagnostics.length > 0 ? (
        <details className="border-t border-line p-3 text-xs">
          <summary className="flex cursor-pointer items-center gap-2 text-muted">
            <AlertTriangle className="size-3.5" />
            {skills.diagnostics.length}{" "}
            {skills.diagnostics.length === 1
              ? t.skills.diagnostic
              : t.skills.diagnostics}
          </summary>
          <ul className="mt-2 space-y-2 text-muted">
            {skills.diagnostics.map((diagnostic, index) => (
              <li key={`${diagnostic.message}-${index}`}>
                <span
                  className={`mr-1.5 font-medium ${
                    diagnostic.severity === "warning"
                      ? "text-warning"
                      : diagnostic.severity === "error"
                        ? "text-destructive-text"
                        : "text-primary"
                  }`}
                >
                  {t.skills.diagnosticSeverity[diagnostic.severity]}
                </span>
                <span>{diagnostic.message}</span>
                {diagnostic.path ? (
                  <span className="mt-0.5 block break-all font-ui-mono text-meta text-dim">
                    {diagnostic.path}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <AddSkillPackDialog
        busy={packs.mutation?.operation === "install-source"}
        onClose={() => setAddingPack(false)}
        onInstall={handleInstallSource}
        open={addingPack}
        projectName={projectName}
      />
    </div>
  );
}

function SkillsListView({
  loading,
  onSelectPack,
  onSelectSkill,
  packs,
  projectName,
  selectedPackId,
  selectedSkillId,
  skills,
  view,
}: {
  loading: boolean;
  onSelectPack: (packId: string) => void;
  onSelectSkill: (skillId: string) => void;
  packs: ReturnType<typeof useSkillPacks>["packs"];
  projectName: string;
  selectedPackId: string | null;
  selectedSkillId: string | null;
  skills: ReturnType<typeof useSkills>["skills"];
  view: SkillsView;
}) {
  const { t } = useI18n();
  const empty = view === "skills" ? skills.length === 0 : packs.length === 0;

  if (loading && empty) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted">
        <LoaderCircle className="size-5 animate-spin" />
        <span className="sr-only">
          {view === "skills"
            ? t.skills.loadingSkills
            : t.skills.packs.loading}
        </span>
      </div>
    );
  }

  if (empty) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
        <p className="text-sm font-medium">
          {view === "skills"
            ? t.skills.noSkillsFound
            : t.skills.packs.empty}
        </p>
        {view === "skills" ? (
          <p className="mt-1 text-xs leading-5 text-muted">
            {t.skills.noSkillsFoundDescription}
          </p>
        ) : null}
      </div>
    );
  }

  return view === "skills" ? (
    <SkillList
      onSelect={onSelectSkill}
      projectName={projectName}
      selectedSkillId={selectedSkillId}
      skills={skills}
    />
  ) : (
    <SkillPackList
      onSelect={onSelectPack}
      packs={packs}
      selectedPackId={selectedPackId}
    />
  );
}

function SuccessBanner({ children }: { children: React.ReactNode }) {
  return (
    <div
      aria-live="polite"
      className="flex items-start gap-2 border-b border-success/30 bg-success/8 px-3 py-2 text-xs leading-4 text-success-text"
    >
      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
      {children}
    </div>
  );
}
