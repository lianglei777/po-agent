"use client";

import {
  AlertTriangle,
  Plus,
  RefreshCw,
} from "@/components/icons";
import { useShallow } from "zustand/react/shallow";
import { Alert, Button, Empty, Segmented, Skeleton, Tooltip } from "antd";
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
        <Segmented<SkillsView>
          aria-label={t.skills.title}
          onChange={selectView}
          options={[
            { label: t.skills.packs.tabSkills, value: "skills" },
            { label: t.skills.packs.tabPacks, value: "packs" },
          ]}
          size="small"
          value={view}
        />
        {screen === "list" ? (
          <div className="ml-auto flex items-center gap-1">
            <Tooltip
              placement="bottom"
              title={
                view === "skills" ? t.skills.addSkill : t.skills.packs.addAction
              }
            >
              <span className="inline-flex">
                <Button
                  aria-label={
                    view === "skills"
                      ? t.skills.addSkill
                      : t.skills.packs.addAction
                  }
                  disabled={view === "packs" && packBusy}
                  htmlType="button"
                  icon={<Plus />}
                  onClick={() =>
                    view === "skills"
                      ? setScreen("add-skill")
                      : setAddingPack(true)
                  }
                  size="small"
                  type="text"
                />
              </span>
            </Tooltip>
            <Tooltip
              placement="bottom"
              title={
                view === "skills"
                  ? t.skills.refreshSkills
                  : t.skills.packs.refresh
              }
            >
              <span className="inline-flex">
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
                  htmlType="button"
                  icon={<RefreshCw />}
                  loading={view === "skills" ? skills.loading : packs.loading}
                  onClick={() =>
                    void (view === "skills" ? skills.refresh() : packs.refresh())
                  }
                  size="small"
                  type="text"
                />
              </span>
            </Tooltip>
          </div>
        ) : null}
      </div>

      {activeError ? (
        <Alert
          action={
            <Button
              htmlType="button"
              onClick={() =>
                void (view === "skills" ? skills.refresh() : packs.refresh())
              }
              size="small"
            >
              {t.common.retry}
            </Button>
          }
          banner
          showIcon
          title={activeError}
          type="error"
        />
      ) : null}

      {removeSuccess && !removing ? (
        <Alert banner showIcon title={removeSuccess} type="success" />
      ) : null}
      {packSuccess && view === "packs" && !packBusy ? (
        <Alert banner showIcon title={packSuccess} type="success" />
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
      <div
        aria-label={
          view === "skills" ? t.skills.loadingSkills : t.skills.packs.loading
        }
        className="flex-1 p-3"
      >
        <Skeleton active paragraph={{ rows: 6 }} title={false} />
      </div>
    );
  }

  if (empty) {
    return (
      <div className="grid flex-1 place-items-center p-6">
        <Empty
          description={
            <div>
              <p className="text-sm font-medium text-primary">
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
          }
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
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
