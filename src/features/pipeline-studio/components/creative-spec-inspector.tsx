"use client";

import { useState, type ReactNode } from "react";
import { Button, Input, InputNumber, Select } from "antd";
import type { CanvasCreativeSpec, CanvasNode } from "@/contracts/pipeline";
import { useI18n } from "@/i18n/use-i18n";
import { downstreamImpact, nodeDataWithCreativeSpec } from "../model/creative-spec";

export function CreativeSpecInspector({
  node,
  nodes,
  edges,
  onSave,
  onClose,
}: {
  node: CanvasNode;
  nodes: CanvasNode[];
  edges: Array<{ sourceNodeId: string; targetNodeId: string }>;
  onSave: (data: NonNullable<CanvasNode["data"]>) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const initial = node.data?.creativeSpec;
  const [draft, setDraft] = useState<CanvasCreativeSpec | null>(() => initial ? structuredClone(initial) : null);
  if (!node.data || !draft) return null;
  const downstream = downstreamImpact(node.id, nodes, edges);
  const staleCount = downstream.filter((candidate) => candidate.data?.generationProvenance?.stale).length;

  return (
    <aside
      className="absolute bottom-16 right-4 top-16 z-30 flex w-[min(340px,calc(100%-32px))] flex-col rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)]/98 shadow-[var(--pl-shadow-hover)] backdrop-blur"
      aria-label={t.pipeline.creativeSpecInspectorTitle}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <header className="flex items-center justify-between border-b border-[var(--pl-border)] px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--pl-text)]">{t.pipeline.creativeSpecInspectorTitle}</p>
          <p className="truncate text-caption text-[var(--pl-text-muted)]">{node.data.name}</p>
        </div>
        <Button type="text" size="small" onClick={onClose} aria-label={t.pipeline.creativeSpecInspectorClose}>×</Button>
      </header>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {draft.kind === "script" ? <ScriptFields value={draft} onChange={setDraft} /> : null}
        {draft.kind === "asset" ? <AssetFields value={draft} onChange={setDraft} /> : null}
        {draft.kind === "shot" ? <ShotFields value={draft} onChange={setDraft} /> : null}

        <section className="border-t border-[var(--pl-border)] pt-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-caption font-semibold text-[var(--pl-text-secondary)]">{t.pipeline.creativeSpecImpactTitle}</h3>
            <span className="text-caption tabular-nums text-[var(--pl-text-muted)]">
              {t.pipeline.creativeSpecImpactCount.replace("{count}", String(downstream.length))}
            </span>
          </div>
          {downstream.length ? (
            <ul className="mt-2 space-y-1.5">
              {downstream.slice(0, 8).map((candidate) => (
                <li key={candidate.id} className="flex items-center justify-between gap-2 rounded-md bg-[var(--pl-surface)] px-2 py-1.5 text-caption">
                  <span className="truncate text-[var(--pl-text-secondary)]">{candidate.data?.name ?? candidate.id}</span>
                  {candidate.data?.generationProvenance?.stale ? <span className="shrink-0 text-[var(--pl-danger)]">{t.pipeline.creativeSpecImpactStale}</span> : null}
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-caption text-[var(--pl-text-muted)]">{t.pipeline.creativeSpecImpactNone}</p>}
          {staleCount ? <p className="mt-2 text-caption text-[var(--pl-danger)]">{t.pipeline.creativeSpecImpactReason}</p> : null}
        </section>
      </div>
      <footer className="border-t border-[var(--pl-border)] p-3">
        <Button type="primary" block onClick={() => onSave(nodeDataWithCreativeSpec(node.data!, draft))}>
          {t.pipeline.creativeSpecSave}
        </Button>
      </footer>
    </aside>
  );
}

function ScriptFields({ value, onChange }: { value: Extract<CanvasCreativeSpec, { kind: "script" }>; onChange: (value: CanvasCreativeSpec) => void }) {
  const { t } = useI18n();
  return <>
    <Field label={t.pipeline.creativeSpecTitle}><Input value={value.title} onChange={(event) => onChange({ ...value, title: event.target.value })} /></Field>
    <Field label={t.pipeline.creativeSpecObjective}><Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} value={value.objective} onChange={(event) => onChange({ ...value, objective: event.target.value })} /></Field>
    <Field label={t.pipeline.creativeSpecDuration}><InputNumber min={1} max={7200} className="w-full" value={value.estimatedDurationSeconds} onChange={(next) => onChange({ ...value, estimatedDurationSeconds: next ?? undefined })} /></Field>
    <Field label={t.pipeline.creativeSpecCharacters}><Input value={value.characters.join("、")} onChange={(event) => onChange({ ...value, characters: splitList(event.target.value) })} /></Field>
  </>;
}

function AssetFields({ value, onChange }: { value: Extract<CanvasCreativeSpec, { kind: "asset" }>; onChange: (value: CanvasCreativeSpec) => void }) {
  const { t } = useI18n();
  return <>
    <Field label={t.pipeline.creativeSpecAssetType}><Select className="w-full" value={value.assetType} options={[
      { value: "character", label: t.pipeline.creativeSpecAssetCharacter }, { value: "scene", label: t.pipeline.creativeSpecAssetScene }, { value: "prop", label: t.pipeline.creativeSpecAssetProp },
    ]} onChange={(assetType) => onChange({ ...value, assetType })} /></Field>
    <Field label={t.pipeline.creativeSpecCanonicalName}><Input value={value.canonicalName} onChange={(event) => onChange({ ...value, canonicalName: event.target.value })} /></Field>
    <Field label={t.pipeline.creativeSpecIdentityKey}>
      <Input value={value.identityKey} readOnly title={t.pipeline.creativeSpecIdentityKeyReadOnly} />
    </Field>
    <Field label={t.pipeline.creativeSpecAliases}><Input value={value.aliases.join("、")} onChange={(event) => onChange({ ...value, aliases: splitList(event.target.value) })} /></Field>
    <Field label={t.pipeline.creativeSpecVisual}><Input.TextArea autoSize={{ minRows: 3, maxRows: 7 }} value={value.visualDescription} onChange={(event) => onChange({ ...value, visualDescription: event.target.value })} /></Field>
    <Field label={t.pipeline.creativeSpecContinuity}><Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} value={value.continuityFacts.join("\n")} onChange={(event) => onChange({ ...value, continuityFacts: splitLines(event.target.value) })} /></Field>
  </>;
}

function ShotFields({ value, onChange }: { value: Extract<CanvasCreativeSpec, { kind: "shot" }>; onChange: (value: CanvasCreativeSpec) => void }) {
  const { t } = useI18n();
  return <>
    <Field label={t.pipeline.creativeSpecPurpose}><Input value={value.purpose} onChange={(event) => onChange({ ...value, purpose: event.target.value })} /></Field>
    <Field label={t.pipeline.creativeSpecDuration}><InputNumber min={0.5} max={300} step={0.5} className="w-full" value={value.durationSeconds} onChange={(next) => onChange({ ...value, durationSeconds: next ?? value.durationSeconds })} /></Field>
    <Field label={t.pipeline.creativeSpecVisual}><Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} value={value.visual} onChange={(event) => onChange({ ...value, visual: event.target.value })} /></Field>
    <Field label={t.pipeline.creativeSpecShotSize}><Input value={value.shotSize} onChange={(event) => onChange({ ...value, shotSize: event.target.value })} /></Field>
    <Field label={t.pipeline.creativeSpecCamera}><Input value={value.cameraMovement} onChange={(event) => onChange({ ...value, cameraMovement: event.target.value })} /></Field>
    <Field label={t.pipeline.creativeSpecBlocking}><Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} value={value.blocking} onChange={(event) => onChange({ ...value, blocking: event.target.value })} /></Field>
    <Field label={t.pipeline.creativeSpecLighting}><Input value={value.lighting} onChange={(event) => onChange({ ...value, lighting: event.target.value })} /></Field>
  </>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-caption font-medium text-[var(--pl-text-secondary)]">{label}</span>{children}</label>;
}

function splitList(value: string): string[] {
  return value.split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean);
}

function splitLines(value: string): string[] {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}
