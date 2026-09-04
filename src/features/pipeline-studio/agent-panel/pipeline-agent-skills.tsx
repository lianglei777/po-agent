"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Input, Segmented, Switch } from "antd";
import type { SkillInfo, SkillSearchResult } from "@/contracts/skills";
import { ArrowLeft, Download, RefreshCw, Search } from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import { pipelineStudioApi } from "../api/pipeline-studio-api";

export function PipelineAgentSkills({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { t } = useI18n();
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [mode, setMode] = useState<"installed" | "market" | "local">("installed");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SkillSearchResult[]>([]);
  const [sourceFilePath, setSourceFilePath] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { setSkills((await pipelineStudioApi.getPipelineSkills(projectId)).skills); }, [projectId]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((cause) => setError(cause instanceof Error ? cause.message : t.pipeline.canvasAgentPanelSkillsError));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load, t.pipeline.canvasAgentPanelSkillsError]);
  const mutate = async (key: string, operation: () => Promise<{ skills: SkillInfo[]; sessionReloaded: boolean }>) => {
    setBusy(key); setError(null);
    try { const result = await operation(); setSkills(result.skills); if (!result.sessionReloaded) setError(t.pipeline.canvasAgentPanelSkillsReloadNeeded); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t.pipeline.canvasAgentPanelSkillsError); }
    finally { setBusy(null); }
  };
  const hasShortDrama = skills.some((skill) => skill.name === "short-drama" && skill.sourceInfo.scope === "project");
  return <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
    <div className="mb-4 flex items-center gap-2"><Button type="text" size="small" icon={<ArrowLeft />} onClick={onClose}>{t.pipeline.canvasAgentPanelSkillsBack}</Button><span className="text-sm font-medium">{t.pipeline.canvasAgentPanelSkills}</span></div>
    <p className="mb-3 text-xs leading-5 text-[var(--pl-text-muted)]">{t.pipeline.canvasAgentPanelSkillsDescription}</p>
    {!hasShortDrama ? <div className="mb-3 rounded border border-[var(--pl-border)] p-3">
      <p className="text-sm font-medium">{t.pipeline.canvasAgentPanelSkillsShortDramaTitle}</p>
      <p className="mt-1 text-xs leading-5 text-[var(--pl-text-muted)]">{t.pipeline.canvasAgentPanelSkillsShortDramaDescription}</p>
      <Button className="mt-2" size="small" icon={<Download />} loading={busy === "short-drama"} onClick={() => void mutate("short-drama", () => pipelineStudioApi.installShortDramaSkill(projectId))}>{t.pipeline.canvasAgentPanelSkillsShortDramaInstall}</Button>
    </div> : null}
    <Segmented className="mb-3 w-full" size="small" value={mode} onChange={(value) => setMode(value as typeof mode)} options={[{ label: t.pipeline.canvasAgentPanelSkillsInstalled, value: "installed" }, { label: t.pipeline.canvasAgentPanelSkillsMarket, value: "market" }, { label: t.pipeline.canvasAgentPanelSkillsLocal, value: "local" }]} />
    {error ? <Alert className="mb-3" showIcon type="warning" title={error} /> : null}
    {mode === "installed" ? <div className="space-y-2">{skills.filter((skill) => skill.sourceInfo.scope === "project").map((skill) => <div key={skill.skillId} className="rounded border border-[var(--pl-border)] p-2"><div className="flex items-center justify-between gap-2"><span className="truncate text-sm">{skill.name}</span><Switch size="small" checked={!skill.disableModelInvocation} loading={busy === skill.skillId} onChange={(checked) => void mutate(skill.skillId, () => pipelineStudioApi.updatePipelineSkill(projectId, { skillId: skill.skillId, disabled: !checked, expectedVersion: skill.version }))} /></div><p className="mt-1 text-xs text-[var(--pl-text-muted)]">{skill.description || skill.displayPath}</p></div>)}{skills.filter((skill) => skill.sourceInfo.scope === "project").length === 0 ? <p className="py-6 text-center text-xs text-[var(--pl-text-muted)]">{t.pipeline.canvasAgentPanelSkillsEmpty}</p> : null}</div> : null}
    {mode === "market" ? <div className="space-y-3"><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.pipeline.canvasAgentPanelSkillsSearchPlaceholder} prefix={<Search />} onPressEnter={() => void pipelineStudioApi.searchPipelineSkills(projectId, query).then((response) => setResults(response.results)).catch((cause) => setError(cause instanceof Error ? cause.message : t.pipeline.canvasAgentPanelSkillsError))} />{results.map((skill) => <div key={skill.id} className="rounded border border-[var(--pl-border)] p-2"><p className="text-sm">{skill.name}</p><p className="mt-1 text-xs text-[var(--pl-text-muted)]">{skill.description}</p><Button className="mt-2" size="small" icon={<Download />} loading={busy === skill.id} onClick={() => void mutate(skill.id, () => pipelineStudioApi.installPipelineSkill(projectId, { package: skill.packageSpec }))}>{t.pipeline.canvasAgentPanelSkillsInstall}</Button></div>)}</div> : null}
    {mode === "local" ? <div className="space-y-3"><Input value={sourceFilePath} onChange={(event) => setSourceFilePath(event.target.value)} placeholder={t.pipeline.canvasAgentPanelSkillsLocalPlaceholder} /><Button block type="primary" icon={<Download />} disabled={!sourceFilePath.trim()} loading={busy === "local"} onClick={() => void mutate("local", () => pipelineStudioApi.importPipelineSkill(projectId, { sourceFilePath: sourceFilePath.trim() }))}>{t.pipeline.canvasAgentPanelSkillsImport}</Button></div> : null}
    <Button className="mt-4" size="small" icon={<RefreshCw />} onClick={() => void load()}>{t.pipeline.canvasAgentPanelSkillsRefresh}</Button>
  </div>;
}
