"use client";

import { ChevronDown, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  ContentGenerationApi,
  ContentGenerationParameterField,
  ContentGenerationProvider,
  JsonValue,
  SaveContentGenerationApiRequest,
  SaveContentGenerationProviderRequest,
} from "@/contracts/content-generation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n/use-i18n";
import {
  deleteContentGenerationApi,
  deleteContentGenerationProvider,
  loadContentGenerationApis,
  loadContentGenerationProviders,
  saveContentGenerationApi,
  saveContentGenerationProvider,
} from "./api";
import {
  createBuiltinRunningHubApis,
  createBuiltinRunningHubProvider,
  createContentGenerationApiDraft,
  createContentGenerationProviderDraft,
} from "./defaults";
import { ContentGenerationApiDocumentation } from "./content-generation-api-documentation";

type Selection =
  | { type: "provider"; id: string }
  | { type: "api"; id: string };

type ProviderDraft = SaveContentGenerationProviderRequest & {
  rawCommonHeaders: string;
};

type ApiDraft = SaveContentGenerationApiRequest & {
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
  const labels = t.contentGeneration;
  const inputLabels = labels.inputs as Readonly<Record<string, string>>;
  const [providers, setProviders] = useState<ContentGenerationProvider[]>([]);
  const [apis, setApis] = useState<ContentGenerationApi[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [providerDraft, setProviderDraft] = useState<ProviderDraft | null>(null);
  const [apiDraft, setApiDraft] = useState<ApiDraft | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showProviderMenu, setShowProviderMenu] = useState(false);
  const [storedProviderIds, setStoredProviderIds] = useState<ReadonlySet<string>>(new Set());
  const [storedApiIds, setStoredApiIds] = useState<ReadonlySet<string>>(new Set());

  const currentSnapshot = providerDraft
    ? JSON.stringify(providerDraft)
    : apiDraft
      ? JSON.stringify(apiDraft)
      : null;

  useEffect(() => {
    onDirtyChange?.(currentSnapshot !== null && currentSnapshot !== savedSnapshot);
  }, [currentSnapshot, onDirtyChange, savedSnapshot]);

  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  useEffect(() => {
    void Promise.all([
      loadContentGenerationProviders(),
      loadContentGenerationApis(),
    ])
      .then(([nextProviders, nextApis]) => {
        setStoredProviderIds(new Set(nextProviders.map((p) => p.id)));
        setStoredApiIds(new Set(nextApis.map((a) => a.id)));

        // 合并内置 RunningHub 供应商——始终展示，无需手动添加
        const storedRunninghub = nextProviders.find((p) => p.type === "runninghub");
        const builtinProvider = createBuiltinRunningHubProvider();
        const mergedProviders = storedRunninghub
          ? nextProviders
          : [builtinProvider, ...nextProviders];

        // 合并内置 RunningHub API——作为子项直接展示
        const runninghubId = storedRunninghub?.id ?? builtinProvider.id;
        const builtinApis = createBuiltinRunningHubApis(runninghubId);
        const mergedApis = [...nextApis];
        for (const builtin of builtinApis) {
          if (!mergedApis.some((a) => a.catalogId === builtin.catalogId)) {
            mergedApis.push(builtin);
          }
        }

        setProviders(mergedProviders);
        setApis(mergedApis);
        if (mergedProviders[0]) selectProvider(mergedProviders[0]);
      })
      .catch((cause) => setError(messageOf(cause)))
      .finally(() => setLoading(false));
  }, []);

  function selectProvider(provider: ContentGenerationProvider) {
    const draft = toProviderDraft(provider);
    setSelection({ type: "provider", id: provider.id });
    setProviderDraft(draft);
    setApiDraft(null);
    setSavedSnapshot(JSON.stringify(draft));
    setError("");
  }

  function selectApi(api: ContentGenerationApi) {
    const draft = toApiDraft(api);
    setSelection({ type: "api", id: api.id });
    setProviderDraft(null);
    setApiDraft(draft);
    setSavedSnapshot(JSON.stringify(draft));
    setError("");
  }

  function addProvider(type: "runninghub" | "custom") {
    const draft = toProviderDraft(createContentGenerationProviderDraft(type));
    setSelection({ type: "provider", id: draft.id });
    setProviderDraft(draft);
    setApiDraft(null);
    setSavedSnapshot(null);
    setShowProviderMenu(false);
    setError("");
  }

  function addApi(provider: ContentGenerationProvider, source?: SaveContentGenerationApiRequest) {
    const draft = toApiDraft(source ?? createContentGenerationApiDraft(provider.id));
    setSelection({ type: "api", id: draft.id });
    setApiDraft(draft);
    setProviderDraft(null);
    setSavedSnapshot(null);
    setError("");
  }

  async function saveProvider() {
    if (!providerDraft || saving) return;
    setSaving(true);
    setError("");
    try {
      const saved = await saveContentGenerationProvider(fromProviderDraft(providerDraft));
      setStoredProviderIds((current) => new Set([...current, saved.id]));
      setProviders((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      selectProvider(saved);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setSaving(false);
    }
  }

  async function saveApi() {
    if (!apiDraft || saving) return;
    setSaving(true);
    setError("");
    try {
      const saved = await saveContentGenerationApi(fromApiDraft(apiDraft));
      setStoredApiIds((current) => new Set([...current, saved.id]));
      setApis((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      selectApi(saved);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setSaving(false);
    }
  }

  async function removeProvider() {
    if (!providerDraft || !providers.some((item) => item.id === providerDraft.id)) return;
    if (!window.confirm(labels.deleteProviderConfirm)) return;
    try {
      await deleteContentGenerationProvider(providerDraft.id);
      setStoredProviderIds((current) => {
        const next = new Set(current);
        next.delete(providerDraft.id);
        return next;
      });
      const next = providers.filter((item) => item.id !== providerDraft.id);
      setProviders(next);
      if (next[0]) selectProvider(next[0]);
      else clearSelection();
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  async function removeApi() {
    if (!apiDraft || !apis.some((item) => item.id === apiDraft.id)) return;
    if (!window.confirm(labels.deleteConfirm)) return;
    try {
      await deleteContentGenerationApi(apiDraft.id);
      setStoredApiIds((current) => {
        const next = new Set(current);
        next.delete(apiDraft.id);
        return next;
      });
      setApis((current) => current.filter((item) => item.id !== apiDraft.id));
      const provider = providers.find((item) => item.id === apiDraft.providerId);
      if (provider) selectProvider(provider);
      else clearSelection();
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  function clearSelection() {
    setSelection(null);
    setProviderDraft(null);
    setApiDraft(null);
    setSavedSnapshot(null);
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <aside className="w-72 flex-none overflow-y-auto border-r border-line-subtle p-3">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold text-primary">{labels.providers}</p>
          <Button
            aria-label={labels.addProvider}
            onClick={() => setShowProviderMenu((value) => !value)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <Plus />
          </Button>
        </div>
        {showProviderMenu ? (
          <div className="mb-3 space-y-1 rounded-md border border-line-subtle bg-subtle p-2">
            <Button className="w-full justify-start" onClick={() => addProvider("custom")} size="sm" type="button" variant="ghost">
              {labels.addCustomProvider}
            </Button>
          </div>
        ) : null}
        {loading ? <p className="text-xs text-muted">{t.common.loading}</p> : null}
        <div className="space-y-1">
          {providers.map((provider) => {
            const providerApis = apis.filter((api) => api.providerId === provider.id);
            return (
              <div key={provider.id}>
                <button
                  className={`w-full rounded-md px-2 py-2 text-left text-xs hover:bg-hover ${selection?.type === "provider" && selection.id === provider.id ? "bg-selected" : ""}`}
                  onClick={() => selectProvider(provider)}
                  type="button"
                >
                  <span className="block truncate font-medium text-primary">{provider.name}</span>
                  <span className="block text-caption text-muted">{provider.type === "runninghub" ? "RunningHub" : labels.customProvider}</span>
                </button>
                <div className="ml-3 border-l border-line-subtle pl-2">
                  {providerApis.map((api) => (
                    <button
                      className={`w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-hover ${selection?.type === "api" && selection.id === api.id ? "bg-selected" : ""}`}
                      key={api.id}
                      onClick={() => selectApi(api)}
                      type="button"
                    >
                      <span className="block truncate text-primary">{api.name}</span>
                      <span className="block truncate font-ui-mono text-caption text-muted">{api.capability}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto px-8 py-6">
        {!providerDraft && !apiDraft ? (
          <div className="grid min-h-72 place-items-center text-sm text-muted">{labels.emptyProviders}</div>
        ) : providerDraft ? (
          <ProviderDetail
            draft={providerDraft}
            existing={storedProviderIds.has(providerDraft.id)}
            labels={labels}
            onAddApi={(source) => {
              const provider = providers.find((item) => item.id === providerDraft.id);
              if (provider) addApi(provider, source);
            }}
            onChange={setProviderDraft}
            onRemove={() => void removeProvider()}
            onSave={() => void saveProvider()}
            saving={saving}
          />
        ) : apiDraft ? (
          <ApiDetail
            draft={apiDraft}
            existing={storedApiIds.has(apiDraft.id)}
            inputLabels={inputLabels}
            labels={labels}
            onChange={setApiDraft}
            onRemove={() => void removeApi()}
            onSave={() => void saveApi()}
            provider={providers.find((provider) => provider.id === apiDraft.providerId)}
            saving={saving}
          />
        ) : null}
        {error ? <p className="mx-auto mt-4 max-w-4xl rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive-text">{error}</p> : null}
      </main>
    </div>
  );
}

function ProviderDetail({
  draft,
  existing,
  labels,
  onAddApi,
  onChange,
  onRemove,
  onSave,
  saving,
}: {
  draft: ProviderDraft;
  existing: boolean;
  labels: ReturnType<typeof useI18n>["t"]["contentGeneration"];
  onAddApi: (source?: SaveContentGenerationApiRequest) => void;
  onChange: (draft: ProviderDraft) => void;
  onRemove: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const [showApiKey, setShowApiKey] = useState(false);
  const isRunningHub = draft.type === "runninghub";
  return (
    <div className="mx-auto max-w-4xl space-y-7">
      <PageHeader title={draft.name || labels.newProvider} description={labels.providerDescription} />
      <Section title={labels.providerSettings}>
        <div className="grid grid-cols-2 gap-4">
          <Field label={labels.providerName}>
            <Input value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} />
          </Field>
          <Field label={labels.providerType}>
            <Input disabled value={isRunningHub ? "RunningHub" : labels.customProvider} />
          </Field>
          <Field label={labels.commonApiKey}>
            <div className="relative">
              <Input
                className="pr-9"
                onChange={(event) => onChange({ ...draft, apiKey: event.target.value })}
                placeholder={existing && !draft.apiKey ? labels.apiKeyStored : labels.apiKeyPlaceholder}
                type={showApiKey ? "text" : "password"}
                value={draft.apiKey ?? ""}
              />
              <button
                aria-label={showApiKey ? labels.hideApiKey : labels.showApiKey}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
                onClick={() => setShowApiKey((value) => !value)}
                type="button"
              >
                {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </Field>
        </div>
        <JsonField label={labels.commonHeaders} value={draft.rawCommonHeaders} onChange={(value) => onChange({ ...draft, rawCommonHeaders: value })} />
      </Section>

      {isRunningHub ? null : (
        <Section title={labels.providerApis}>
          {!existing ? (
            <p className="text-body-sm text-muted">{labels.saveProviderBeforeAddingApi}</p>
          ) : (
            <Button onClick={() => onAddApi()} size="sm" type="button" variant="outline"><Plus />{labels.addCustomApi}</Button>
          )}
        </Section>
      )}
      <EditorFooter deletable={!isRunningHub} existing={existing} onRemove={onRemove} onSave={onSave} saving={saving} />
    </div>
  );
}

function ApiDetail({
  draft,
  existing,
  inputLabels,
  labels,
  onChange,
  onRemove,
  onSave,
  provider,
  saving,
}: {
  draft: ApiDraft;
  existing: boolean;
  inputLabels: Readonly<Record<string, string>>;
  labels: ReturnType<typeof useI18n>["t"]["contentGeneration"];
  onChange: (draft: ApiDraft) => void;
  onRemove: () => void;
  onSave: () => void;
  provider?: ContentGenerationProvider;
  saving: boolean;
}) {
  const [docsExpanded, setDocsExpanded] = useState(false);
  const isRunningHub = provider?.type === "runninghub";
  return (
    <div className="mx-auto max-w-4xl space-y-7">
      <PageHeader title={draft.name || labels.newApi} description={`${provider?.name ?? ""} · ${labels.apiDescription}`} />
      <Section title={labels.basic}>
        <div className="grid grid-cols-2 gap-4">
          <Field label={labels.name}><Input value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} /></Field>
          <Field label={labels.capability}>
            <select className="h-9 w-full rounded-md border border-line-strong bg-canvas px-2 text-xs" value={draft.capability} onChange={(event) => onChange({ ...draft, capability: event.target.value as ApiDraft["capability"] })}>
              <option value="text-to-image">text-to-image</option>
              <option value="text-to-video">text-to-video</option>
              <option value="image-to-image">image-to-image</option>
              <option value="image-to-video">image-to-video</option>
              <option value="multimodal-to-video">multimodal-to-video</option>
            </select>
          </Field>
          <Field label={labels.credentialMode}>
            <select className="h-9 w-full rounded-md border border-line-strong bg-canvas px-2 text-xs" value={draft.credentialMode} onChange={(event) => onChange({ ...draft, credentialMode: event.target.value as "inherit" | "override" })}>
              <option value="inherit">{labels.inheritProviderCredential}</option>
              <option value="override">{labels.overrideCredential}</option>
            </select>
          </Field>
          {draft.credentialMode === "override" ? (
            <Field label={labels.apiKey}>
              <Input onChange={(event) => onChange({ ...draft, apiKey: event.target.value })} placeholder={existing && !draft.apiKey ? labels.apiKeyStored : labels.apiKeyPlaceholder} type="password" value={draft.apiKey ?? ""} />
            </Field>
          ) : null}
        </div>
      </Section>

      {draft.inputSchema ? (
        <Section title={labels.defaultInputs}>
          <Check
            checked={draft.inputSchema.prompt.required}
            label={labels.promptRequired}
            onChange={(checked) => onChange({ ...draft, inputSchema: { ...draft.inputSchema!, prompt: { ...draft.inputSchema!.prompt, required: checked } } })}
          />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {draft.inputSchema.parameters?.map((field, index) => (
              <DefaultValueControl
                field={field}
                key={field.key}
                label={inputLabels[field.key] ?? field.label}
                onChange={(value) => onChange({
                  ...draft,
                  inputSchema: {
                    ...draft.inputSchema!,
                    parameters: draft.inputSchema!.parameters!.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, defaultValue: value } : item),
                  },
                })}
              />
            ))}
          </div>
          {draft.inputSchema.assets?.length ? (
            <div className="flex flex-wrap gap-2 border-t border-line-subtle pt-3">
              {draft.inputSchema.assets.map((slot) => (
                <span className="rounded-md border border-line-subtle bg-subtle px-2 py-1 text-xs" key={slot.key}>
                  {inputLabels[slot.key] ?? slot.label}{slot.required ? " *" : ""} · {slot.maxFiles ?? 1}
                </span>
              ))}
            </div>
          ) : null}
        </Section>
      ) : null}

      {/* API 文档--默认收起，点击展开后懒加载 */}
      <div className="space-y-4">
        <button
          aria-expanded={docsExpanded}
          className="flex w-full items-center gap-2 border-b border-line-subtle pb-2 text-left text-sm font-semibold text-primary"
          onClick={() => setDocsExpanded((value) => !value)}
          type="button"
        >
          <ChevronDown className={`size-4 transition-transform ${docsExpanded ? "" : "-rotate-90"}`} />
          {labels.apiDocumentation}
        </button>
        {docsExpanded ? (
          <>
            <p className="max-w-3xl text-body-sm text-muted">{labels.apiDocumentationDescription}</p>
            <ContentGenerationApiDocumentation
              catalogId={draft.catalogId}
              labels={{
                loading: labels.documentationLoading,
                loadFailed: labels.documentationLoadFailed,
                unavailable: labels.documentationUnavailable,
              }}
            />
          </>
        ) : null}
      </div>
      <EditorFooter deletable={!isRunningHub} existing={existing} onRemove={onRemove} onSave={onSave} saving={saving} />
    </div>
  );
}

function DefaultValueControl({ field, label, onChange }: { field: ContentGenerationParameterField; label: string; onChange: (value: JsonValue) => void }) {
  const value = field.defaultValue;
  if (field.type === "boolean") return <Check checked={value === true} label={label} onChange={onChange} />;
  if (field.type === "select") return <Field label={label}><select className="h-9 w-full rounded-md border border-line-strong bg-canvas px-2 text-xs" onChange={(event) => onChange(optionValue(field, event.target.value))} value={String(value ?? "")}>{field.options?.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}</select></Field>;
  if (field.type === "multi-select") {
    const selected = Array.isArray(value) ? value : [];
    return <fieldset className="space-y-1.5 text-xs"><legend className="font-medium text-primary">{label}</legend><div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-line-subtle bg-subtle p-2">{field.options?.map((option) => <label className="flex items-center gap-2" key={String(option.value)}><input checked={selected.includes(option.value as never)} onChange={(event) => onChange(event.target.checked ? [...selected, option.value] : selected.filter((item) => item !== option.value))} type="checkbox" />{option.label}</label>)}</div></fieldset>;
  }
  return <Field label={label}><Input max={field.max} min={field.min} onChange={(event) => onChange(field.type === "number" ? Number(event.target.value) : event.target.value)} type={field.type === "number" ? "number" : "text"} value={typeof value === "string" || typeof value === "number" ? value : ""} /></Field>;
}

function EditorFooter({ deletable = true, existing, onRemove, onSave, saving }: { deletable?: boolean; existing: boolean; onRemove: () => void; onSave: () => void; saving: boolean }) {
  const { t } = useI18n();
  return <footer className="flex items-center justify-between border-t border-line-subtle pt-4">{deletable ? <Button disabled={!existing} onClick={onRemove} type="button" variant="destructive"><Trash2 />{t.common.delete}</Button> : <div />}<Button disabled={saving} onClick={onSave} type="button">{saving ? t.common.saving : t.common.save}</Button></footer>;
}

function PageHeader({ description, title }: { description: string; title: string }) { return <header className="border-b border-line-subtle pb-4"><h2 className="text-lg font-semibold text-primary">{title}</h2><p className="mt-1 text-body-sm text-muted">{description}</p></header>; }
function Section({ children, title }: { children: React.ReactNode; title: string }) { return <section className="space-y-4"><h3 className="border-b border-line-subtle pb-2 text-sm font-semibold text-primary">{title}</h3>{children}</section>; }
function Field({ children, label }: { children: React.ReactNode; label: string }) { return <label className="block space-y-1.5 text-xs font-medium text-primary"><span>{label}</span>{children}</label>; }
function JsonField({ label, onChange, rows = 4, value }: { label: string; onChange: (value: string) => void; rows?: number; value: string }) { return <Field label={label}><Textarea className="font-ui-mono text-meta" onChange={(event) => onChange(event.target.value)} rows={rows} value={value} /></Field>; }
function Check({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) { return <label className="flex items-center gap-2 text-xs text-primary"><input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />{label}</label>; }

function toProviderDraft(provider: ContentGenerationProvider | SaveContentGenerationProviderRequest): ProviderDraft {
  const source = "hasApiKey" in provider ? Object.fromEntries(Object.entries(provider).filter(([key]) => key !== "hasApiKey")) as unknown as SaveContentGenerationProviderRequest : provider;
  return { ...structuredClone(source), rawCommonHeaders: json(source.commonHeaders ?? {}) };
}
function fromProviderDraft(draft: ProviderDraft): SaveContentGenerationProviderRequest { const { rawCommonHeaders, ...value } = draft; return { ...value, commonHeaders: parseObject(rawCommonHeaders) }; }
function toApiDraft(api: ContentGenerationApi | SaveContentGenerationApiRequest): ApiDraft {
  const source = "hasApiKeyOverride" in api ? Object.fromEntries(Object.entries(api).filter(([key]) => key !== "hasApiKeyOverride")) as unknown as SaveContentGenerationApiRequest : api;
  const completion = structuredClone(source.completion);
  if (completion.mode === "polling") completion.intervalMs = Math.max(completion.intervalMs, 5000);
  return { ...structuredClone(source), completion, rawCommonHeaders: json(source.commonHeaders ?? {}), rawSubmitHeaders: json(source.submit.headers ?? {}), rawSubmitBody: json(source.submit.bodyTemplate ?? {}), rawQueryHeaders: completion.mode === "polling" ? json(completion.request.headers ?? {}) : "{}", rawQueryBody: completion.mode === "polling" ? json(completion.request.bodyTemplate ?? {}) : "{}", rawUploadHeaders: json(source.upload?.headers ?? {}) };
}
function fromApiDraft(draft: ApiDraft): SaveContentGenerationApiRequest {
  const { rawCommonHeaders, rawSubmitHeaders, rawSubmitBody, rawQueryHeaders, rawQueryBody, rawUploadHeaders, ...value } = draft;
  return { ...value, commonHeaders: parseObject(rawCommonHeaders), submit: { ...value.submit, headers: parseObject(rawSubmitHeaders), bodyTemplate: JSON.parse(rawSubmitBody) }, completion: value.completion.mode === "polling" ? { ...value.completion, request: { ...value.completion.request, headers: parseObject(rawQueryHeaders), bodyTemplate: JSON.parse(rawQueryBody) } } : value.completion, upload: value.upload ? { ...value.upload, headers: parseObject(rawUploadHeaders) } : undefined };
}
function parseObject(value: string) { const parsed = JSON.parse(value) as unknown; if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Headers must be a JSON object"); return parsed as Record<string, string>; }
function json(value: unknown) { return JSON.stringify(value, null, 2); }
function messageOf(value: unknown) { return value instanceof Error ? value.message : "Request failed"; }
function optionValue(field: ContentGenerationParameterField, serialized: string) { return field.options?.find((option) => String(option.value) === serialized)?.value ?? serialized; }
