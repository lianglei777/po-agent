"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  ContentCompletionConfig,
  ContentGenerationApi,
  SaveContentGenerationApiRequest,
} from "@/contracts/content-generation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n/use-i18n";
import {
  deleteContentGenerationApi,
  loadContentGenerationApis,
  saveContentGenerationApi,
} from "./api";
import {
  createContentGenerationApiDraft,
  createRunningHubDraft,
} from "./defaults";

type EditorDraft = SaveContentGenerationApiRequest & {
  rawCommonHeaders: string;
  rawSubmitHeaders: string;
  rawSubmitBody: string;
  rawQueryHeaders: string;
  rawQueryBody: string;
  rawUploadHeaders: string;
};

export function ContentGenerationSettings({
  onDirtyChange,
}: {
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { t } = useI18n();
  const [apis, setApis] = useState<ContentGenerationApi[]>([]);
  const [draft, setDraft] = useState<EditorDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);

  useEffect(() => {
    onDirtyChange?.(Boolean(draft) && JSON.stringify(draft) !== savedSnapshot);
  }, [draft, onDirtyChange, savedSnapshot]);

  useEffect(
    () => () => onDirtyChange?.(false),
    [onDirtyChange],
  );

  useEffect(() => {
    void loadContentGenerationApis()
      .then((items) => {
        setApis(items);
        if (items[0]) {
          const nextDraft = toDraft(items[0]);
          setDraft(nextDraft);
          setSavedSnapshot(JSON.stringify(nextDraft));
        }
      })
      .catch((cause) => setError(messageOf(cause)))
      .finally(() => setLoading(false));
  }, []);

  function add(template: SaveContentGenerationApiRequest) {
    setDraft(toDraft(template));
    setSavedSnapshot(null);
    setError("");
  }

  async function save() {
    if (!draft || saving) return;
    setSaving(true);
    setError("");
    try {
      const input = fromDraft(draft);
      const saved = await saveContentGenerationApi(input);
      setApis((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      const nextDraft = toDraft(saved);
      setDraft(nextDraft);
      setSavedSnapshot(JSON.stringify(nextDraft));
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!draft || !apis.some((api) => api.id === draft.id)) return;
    if (!window.confirm(t.contentGeneration.deleteConfirm)) return;
    try {
      await deleteContentGenerationApi(draft.id);
      const next = apis.filter((api) => api.id !== draft.id);
      setApis(next);
      const nextDraft = next[0] ? toDraft(next[0]) : null;
      setDraft(nextDraft);
      setSavedSnapshot(nextDraft ? JSON.stringify(nextDraft) : null);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <aside className="w-64 flex-none overflow-y-auto border-r border-line-subtle p-3">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold text-primary">
            {t.contentGeneration.apis}
          </p>
          <Button
            aria-label={t.contentGeneration.addApi}
            onClick={() => add(createContentGenerationApiDraft())}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <Plus />
          </Button>
        </div>
        <Button
          className="mb-3 w-full justify-start text-xs"
          onClick={() => add(createRunningHubDraft())}
          size="sm"
          type="button"
          variant="outline"
        >
          {t.contentGeneration.addRunningHub}
        </Button>
        {loading ? <p className="text-xs text-muted">{t.common.loading}</p> : null}
        <div className="space-y-1">
          {apis.map((api) => (
            <button
              className={`w-full rounded-md px-2 py-2 text-left text-xs hover:bg-hover ${draft?.id === api.id ? "bg-selected" : ""}`}
              key={api.id}
              onClick={() => {
                const nextDraft = toDraft(api);
                setDraft(nextDraft);
                setSavedSnapshot(JSON.stringify(nextDraft));
              }}
              type="button"
            >
              <span className="block truncate font-medium text-primary">{api.name}</span>
              <span className="block truncate text-caption text-muted">{api.providerName}</span>
            </button>
          ))}
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto px-8 py-6">
        {!draft ? (
          <div className="grid min-h-72 place-items-center text-sm text-muted">
            {t.contentGeneration.empty}
          </div>
        ) : (
          <div className="mx-auto max-w-4xl space-y-7">
            <header className="border-b border-line-subtle pb-4">
              <h2 className="text-lg font-semibold text-primary">{t.contentGeneration.title}</h2>
              <p className="mt-1 text-body-sm text-muted">{t.contentGeneration.description}</p>
            </header>

            <Section title={t.contentGeneration.basic}>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t.contentGeneration.name}>
                  <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                </Field>
                <Field label={t.contentGeneration.provider}>
                  <Input value={draft.providerName} onChange={(event) => setDraft({ ...draft, providerName: event.target.value })} />
                </Field>
                <Field label={t.contentGeneration.capability}>
                  <select className="h-9 w-full rounded-md border border-line-strong bg-canvas px-2 text-xs" value={draft.capability} onChange={(event) => setDraft({ ...draft, capability: event.target.value as EditorDraft["capability"] })}>
                    <option value="text-to-image">text-to-image</option>
                    <option value="text-to-video">text-to-video</option>
                    <option value="image-to-image">image-to-image</option>
                    <option value="image-to-video">image-to-video</option>
                  </select>
                </Field>
                <Field label={t.contentGeneration.apiKey}>
                  <Input onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })} placeholder={draft.apiKey === undefined && apis.find((item) => item.id === draft.id)?.hasApiKey ? t.contentGeneration.apiKeyStored : t.contentGeneration.apiKeyPlaceholder} type="password" value={draft.apiKey ?? ""} />
                </Field>
              </div>
              <JsonField label={t.contentGeneration.commonHeaders} value={draft.rawCommonHeaders} onChange={(value) => setDraft({ ...draft, rawCommonHeaders: value })} />
              <Check label={t.contentGeneration.requiresImages} checked={draft.requiresImages} onChange={(checked) => setDraft({ ...draft, requiresImages: checked })} />
            </Section>

            <Section title={t.contentGeneration.submitApi}>
              <Field label={t.contentGeneration.url}><Input value={draft.submit.url} onChange={(event) => setDraft({ ...draft, submit: { ...draft.submit, url: event.target.value } })} /></Field>
              <JsonField label={t.contentGeneration.headers} value={draft.rawSubmitHeaders} onChange={(value) => setDraft({ ...draft, rawSubmitHeaders: value })} />
              <JsonField label={t.contentGeneration.bodyTemplate} value={draft.rawSubmitBody} onChange={(value) => setDraft({ ...draft, rawSubmitBody: value })} rows={8} />
              <div className="grid grid-cols-3 gap-4">
                <Field label={t.contentGeneration.taskIdPath}><Input value={draft.submit.taskIdPath ?? ""} onChange={(event) => setDraft({ ...draft, submit: { ...draft.submit, taskIdPath: event.target.value } })} /></Field>
                <Field label={t.contentGeneration.statusPath}><Input value={draft.submit.statusPath ?? ""} onChange={(event) => setDraft({ ...draft, submit: { ...draft.submit, statusPath: event.target.value } })} /></Field>
                <Field label={t.contentGeneration.errorPath}><Input value={draft.submit.errorPath ?? ""} onChange={(event) => setDraft({ ...draft, submit: { ...draft.submit, errorPath: event.target.value } })} /></Field>
              </div>
            </Section>

            <Section title={t.contentGeneration.queryApi}>
              <Check label={t.contentGeneration.asyncGeneration} checked={draft.completion.mode === "polling"} onChange={(checked) => setDraft({ ...draft, completion: checked ? createContentGenerationApiDraft().completion : { mode: "immediate" } })} />
              {draft.completion.mode === "polling" ? (
                <>
                  <Field label={t.contentGeneration.url}><Input value={draft.completion.request.url} onChange={(event) => setDraft(withPolling(draft, (completion) => ({ ...completion, request: { ...completion.request, url: event.target.value } })))} /></Field>
                  <JsonField label={t.contentGeneration.headers} value={draft.rawQueryHeaders} onChange={(value) => setDraft({ ...draft, rawQueryHeaders: value })} />
                  <JsonField label={t.contentGeneration.bodyTemplate} value={draft.rawQueryBody} onChange={(value) => setDraft({ ...draft, rawQueryBody: value })} />
                  <div className="grid grid-cols-2 gap-4">
                    <Field label={t.contentGeneration.statusPath}><Input value={draft.completion.statusPath} onChange={(event) => setDraft(withPolling(draft, (completion) => ({ ...completion, statusPath: event.target.value })))} /></Field>
                    <Field label={t.contentGeneration.errorPath}><Input value={draft.completion.errorPath ?? ""} onChange={(event) => setDraft(withPolling(draft, (completion) => ({ ...completion, errorPath: event.target.value })))} /></Field>
                    <Field label={t.contentGeneration.pendingValues}><Input value={draft.completion.pendingValues.join(", ")} onChange={(event) => setDraft(withPolling(draft, (completion) => ({ ...completion, pendingValues: csv(event.target.value) })))} /></Field>
                    <Field label={t.contentGeneration.successValues}><Input value={draft.completion.successValues.join(", ")} onChange={(event) => setDraft(withPolling(draft, (completion) => ({ ...completion, successValues: csv(event.target.value) })))} /></Field>
                    <Field label={t.contentGeneration.failureValues}><Input value={draft.completion.failureValues.join(", ")} onChange={(event) => setDraft(withPolling(draft, (completion) => ({ ...completion, failureValues: csv(event.target.value) })))} /></Field>
                    <Field label={t.contentGeneration.pollInterval}><Input min={5000} type="number" value={draft.completion.intervalMs} onChange={(event) => setDraft(withPolling(draft, (completion) => ({ ...completion, intervalMs: Number(event.target.value) })))} /></Field>
                  </div>
                </>
              ) : null}
            </Section>

            <Section title={t.contentGeneration.uploadApi}>
              <Check label={t.contentGeneration.enableUpload} checked={Boolean(draft.upload)} onChange={(checked) => setDraft({ ...draft, upload: checked ? createRunningHubDraft().upload : undefined })} />
              {draft.upload ? (
                <>
                  <Field label={t.contentGeneration.url}><Input value={draft.upload.url} onChange={(event) => setDraft({ ...draft, upload: { ...draft.upload!, url: event.target.value } })} /></Field>
                  <JsonField label={t.contentGeneration.headers} value={draft.rawUploadHeaders} onChange={(value) => setDraft({ ...draft, rawUploadHeaders: value })} />
                  <div className="grid grid-cols-3 gap-4">
                    <Field label={t.contentGeneration.fileField}><Input value={draft.upload.fileField} onChange={(event) => setDraft({ ...draft, upload: { ...draft.upload!, fileField: event.target.value } })} /></Field>
                    <Field label={t.contentGeneration.uploadUrlPath}><Input value={draft.upload.urlPath} onChange={(event) => setDraft({ ...draft, upload: { ...draft.upload!, urlPath: event.target.value } })} /></Field>
                    <Field label={t.contentGeneration.uploadErrorPath}><Input value={draft.upload.errorPath ?? ""} onChange={(event) => setDraft({ ...draft, upload: { ...draft.upload!, errorPath: event.target.value } })} /></Field>
                  </div>
                </>
              ) : null}
            </Section>

            <Section title={t.contentGeneration.outputMapping}>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t.contentGeneration.collectionPath}><Input value={draft.output.collectionPath} onChange={(event) => setDraft({ ...draft, output: { ...draft.output, collectionPath: event.target.value } })} /></Field>
                <Field label={t.contentGeneration.outputUrlPath}><Input value={draft.output.urlPath ?? ""} onChange={(event) => setDraft({ ...draft, output: { ...draft.output, urlPath: event.target.value } })} /></Field>
                <Field label={t.contentGeneration.outputTypePath}><Input value={draft.output.typePath ?? ""} onChange={(event) => setDraft({ ...draft, output: { ...draft.output, typePath: event.target.value } })} /></Field>
                <Field label={t.contentGeneration.outputTextPath}><Input value={draft.output.textPath ?? ""} onChange={(event) => setDraft({ ...draft, output: { ...draft.output, textPath: event.target.value } })} /></Field>
              </div>
            </Section>

            {error ? <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive-text">{error}</p> : null}
            <footer className="flex items-center justify-between border-t border-line-subtle pt-4">
              <Button disabled={!apis.some((api) => api.id === draft.id)} onClick={() => void remove()} type="button" variant="destructive"><Trash2 />{t.common.delete}</Button>
              <Button disabled={saving} onClick={() => void save()} type="button">{saving ? t.common.saving : t.common.save}</Button>
            </footer>
          </div>
        )}
      </main>
    </div>
  );
}

function Section({ children, title }: { children: React.ReactNode; title: string }) {
  return <section className="space-y-4"><h3 className="border-b border-line-subtle pb-2 text-sm font-semibold text-primary">{title}</h3>{children}</section>;
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return <label className="block space-y-1.5 text-xs font-medium text-primary"><span>{label}</span>{children}</label>;
}

function JsonField({ label, onChange, rows = 4, value }: { label: string; onChange: (value: string) => void; rows?: number; value: string }) {
  return <Field label={label}><Textarea className="font-ui-mono text-meta" onChange={(event) => onChange(event.target.value)} rows={rows} value={value} /></Field>;
}

function Check({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return <label className="flex items-center gap-2 text-xs text-primary"><input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />{label}</label>;
}

function toDraft(api: ContentGenerationApi | SaveContentGenerationApiRequest): EditorDraft {
  const source = "hasApiKey" in api
    ? (Object.fromEntries(
        Object.entries(api).filter(([key]) => key !== "hasApiKey"),
      ) as unknown as SaveContentGenerationApiRequest)
    : api;
  const completion = structuredClone(source.completion);
  return {
    ...structuredClone(source),
    rawCommonHeaders: json(source.commonHeaders ?? {}),
    rawSubmitHeaders: json(source.submit.headers ?? {}),
    rawSubmitBody: json(source.submit.bodyTemplate ?? {}),
    rawQueryHeaders: completion.mode === "polling" ? json(completion.request.headers ?? {}) : "{}",
    rawQueryBody: completion.mode === "polling" ? json(completion.request.bodyTemplate ?? {}) : "{}",
    rawUploadHeaders: json(source.upload?.headers ?? {}),
  };
}

function fromDraft(draft: EditorDraft): SaveContentGenerationApiRequest {
  const { rawCommonHeaders, rawSubmitHeaders, rawSubmitBody, rawQueryHeaders, rawQueryBody, rawUploadHeaders, ...value } = draft;
  return {
    ...value,
    commonHeaders: parseObject(rawCommonHeaders),
    submit: { ...value.submit, headers: parseObject(rawSubmitHeaders), bodyTemplate: JSON.parse(rawSubmitBody) },
    completion: value.completion.mode === "polling" ? { ...value.completion, request: { ...value.completion.request, headers: parseObject(rawQueryHeaders), bodyTemplate: JSON.parse(rawQueryBody) } } : value.completion,
    upload: value.upload ? { ...value.upload, headers: parseObject(rawUploadHeaders) } : undefined,
  };
}

function parseObject(value: string) {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Headers must be a JSON object");
  return parsed as Record<string, string>;
}

function json(value: unknown) { return JSON.stringify(value, null, 2); }
function csv(value: string) { return value.split(",").map((item) => item.trim()).filter(Boolean); }
function messageOf(value: unknown) { return value instanceof Error ? value.message : "Request failed"; }

type PollingCompletion = Extract<ContentCompletionConfig, { mode: "polling" }>;

function withPolling(
  draft: EditorDraft,
  update: (completion: PollingCompletion) => PollingCompletion,
): EditorDraft {
  if (draft.completion.mode !== "polling") return draft;
  return { ...draft, completion: update(draft.completion) };
}
