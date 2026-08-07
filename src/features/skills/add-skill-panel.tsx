"use client";

import {
  ArrowLeft,
  Download,
  ExternalLink,
  LoaderCircle,
  Search,
} from "@/components/icons";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Empty, Input, Radio, Segmented, Tag } from "antd";
import { SectionTitle } from "@/components/ui/settings-form";
import { useI18n } from "@/i18n/use-i18n";
import { createLocalSkill, installSkill, searchSkills } from "./api";
import type {
  SkillInfo,
  SkillSearchResult,
} from "./types";

type SkillOperationResult = { skills: SkillInfo[] };

export function AddSkillPanel({
  cwd,
  onBack,
  onInstalled,
  projectName,
}: {
  cwd: string;
  onBack: () => void;
  onInstalled: (result: SkillOperationResult) => void;
  projectName: string;
}) {
  const [mode, setMode] = useState<"market" | "local">("market");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"project" | "global">("project");
  const [results, setResults] = useState<SkillSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [localFilePath, setLocalFilePath] = useState("");
  const [creating, setCreating] = useState(false);
  const searchRequest = useRef<AbortController | null>(null);
  const installRequest = useRef<AbortController | null>(null);
  const createRequest = useRef<AbortController | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    return () => {
      searchRequest.current?.abort();
      installRequest.current?.abort();
      createRequest.current?.abort();
    };
  }, [cwd]);

  useEffect(() => {
    searchRequest.current?.abort();
    const normalized = query.trim();
    if (!normalized) return;
    const controller = new AbortController();
    searchRequest.current = controller;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setError(null);
      try {
        setResults(await searchSkills(normalized, controller.signal));
      } catch (nextError) {
        if (!controller.signal.aborted) {
          setError(errorMessage(nextError, t.skills.somethingWentWrong));
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, t.skills.somethingWentWrong]);

  async function handleInstall(skill: SkillSearchResult) {
    if (installing) return;
    const controller = new AbortController();
    installRequest.current = controller;
    setInstalling(skill.id);
    setError(null);
    setSuccess(null);
    try {
      const result = await installSkill(
        { package: skill.packageSpec, scope, cwd },
        controller.signal,
      );
      const paths = result.skills.map((item) => item.displayPath).join(", ");
      setSuccess(
        `${t.skills.installed} ${skill.name}${paths ? ` ${t.skills.at} ${paths}` : ""}.`,
      );
      onInstalled(result);
    } catch (nextError) {
      if (!controller.signal.aborted) {
        setError(errorMessage(nextError, t.skills.somethingWentWrong));
      }
    } finally {
      if (!controller.signal.aborted) setInstalling(null);
    }
  }

  async function handleCreateLocal() {
    if (creating) return;
    if (!localFilePath.trim()) return;
    const controller = new AbortController();
    createRequest.current = controller;
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await createLocalSkill(
        {
          sourceFilePath: localFilePath.trim(),
          scope,
          cwd,
        },
        controller.signal,
      );
      const skillName = result.skills[0]?.name ?? "";
      const paths = result.skills.map((item) => item.displayPath).join(", ");
      setSuccess(
        `${t.skills.created} ${skillName}${paths ? ` ${t.skills.at} ${paths}` : ""}.`,
      );
      onInstalled(result);
      setLocalFilePath("");
    } catch (nextError) {
      if (!controller.signal.aborted) {
        setError(errorMessage(nextError, t.skills.somethingWentWrong));
      }
    } finally {
      if (!controller.signal.aborted) setCreating(false);
    }
  }

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
          <SectionTitle>{t.skills.addSkill}</SectionTitle>
          <h1 className="mt-1 text-lg font-semibold text-primary">
            {t.skills.addSkill}
          </h1>
        </header>

        {/* Tab 切换 */}
        <Segmented<"market" | "local">
          aria-label={t.skills.addSkill}
          onChange={setMode}
          options={[
            { label: t.skills.market, value: "market" },
            { label: t.skills.createLocal, value: "local" },
          ]}
          size="small"
          value={mode}
        />

        {error ? (
          <Alert showIcon title={error} type="error" />
        ) : null}
        {success ? (
          <Alert showIcon title={success} type="success" />
        ) : null}

        {mode === "market" ? (
          <MarketTab
            error={error}
            installing={installing}
            onInstall={handleInstall}
            projectName={projectName}
            query={query}
            results={results}
            scope={scope}
            searching={searching}
            setError={setError}
            setQuery={setQuery}
            setResults={setResults}
            setSearching={setSearching}
            setScope={setScope}
          />
        ) : (
          <CreateLocalTab
            creating={creating}
            localFilePath={localFilePath}
            onCreate={handleCreateLocal}
            projectName={projectName}
            scope={scope}
            setLocalFilePath={setLocalFilePath}
            setScope={setScope}
          />
        )}
      </div>
    </div>
  );
}

function MarketTab({
  error,
  installing,
  onInstall,
  projectName,
  query,
  results,
  scope,
  searching,
  setError,
  setQuery,
  setResults,
  setSearching,
  setScope,
}: {
  error: string | null;
  installing: string | null;
  onInstall: (skill: SkillSearchResult) => void;
  projectName: string;
  query: string;
  results: SkillSearchResult[];
  scope: "project" | "global";
  searching: boolean;
  setError: (error: string | null) => void;
  setQuery: (value: string) => void;
  setResults: (results: SkillSearchResult[]) => void;
  setSearching: (searching: boolean) => void;
  setScope: (scope: "project" | "global") => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <p className="text-body-sm leading-5 text-muted">
        {t.skills.searchMarketDescription}
      </p>

      <Input
        aria-label={t.skills.searchSkillsMarket}
        autoFocus
        onChange={(event) => {
          const value = event.target.value;
          setQuery(value);
          if (!value.trim()) {
            setResults([]);
            setSearching(false);
            setError(null);
          }
        }}
        placeholder={t.skills.searchSkills}
        prefix={<Search className="text-dim" />}
        suffix={
          searching ? <LoaderCircle className="animate-spin text-muted" /> : null
        }
        value={query}
      />

      <ScopeSelector
        projectName={projectName}
        scope={scope}
        setScope={setScope}
      />

      <div className="space-y-2">
        {!searching && query.trim() && results.length === 0 && !error ? (
          <Empty
            description={t.skills.noMatchingSkills}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : null}
        {results.map((skill) => (
          <article
            className="border-b border-line-subtle bg-panel p-4 last:border-b-0"
            key={skill.id}
          >
            {/* 标题行：技能名称 + source 标签 + 详情链接 */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <h3 className="truncate text-sm font-medium">{skill.name}</h3>
                {skill.url ? (
                  <a
                    href={skill.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 text-dim transition-colors hover:text-muted"
                    aria-label={`${t.skills.viewDetails} ${skill.name}`}
                  >
                    <ExternalLink className="size-3" />
                  </a>
                ) : null}
              </div>
              <Tag
                className="shrink-0 font-ui-mono text-dim"
                variant="outlined"
              >
                {skill.source}
              </Tag>
            </div>
            {/* 描述行：两行截断，空描述时回退到占位文案 */}
            <p
              className={`mt-1.5 line-clamp-2 text-body-sm leading-5 ${
                skill.description ? "text-muted" : "italic text-dim"
              }`}
            >
              {skill.description || t.skills.noDescription}
            </p>
            {/* 元数据 + 操作行：包引用、安装量、安装按钮 */}
            <div className="mt-2.5 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2 text-meta text-dim">
                <code className="rounded border border-line-subtle bg-subtle px-1.5 py-0.5 font-ui-mono text-meta">
                  {skill.packageSpec}
                </code>
                {skill.installs !== undefined ? (
                  <span className="inline-flex shrink-0 items-center gap-1">
                    <Download className="size-3" />
                    {skill.installs.toLocaleString()} {t.skills.installs}
                  </span>
                ) : null}
              </div>
              <Button
                aria-label={`${t.skills.install} ${skill.name}`}
                className="shrink-0"
                disabled={installing !== null}
                htmlType="button"
                icon={<Download />}
                loading={installing === skill.id}
                onClick={() => void onInstall(skill)}
                size="small"
              >
                {t.skills.install}
              </Button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function CreateLocalTab({
  creating,
  localFilePath,
  onCreate,
  projectName,
  scope,
  setLocalFilePath,
  setScope,
}: {
  creating: boolean;
  localFilePath: string;
  onCreate: () => void;
  projectName: string;
  scope: "project" | "global";
  setLocalFilePath: (value: string) => void;
  setScope: (scope: "project" | "global") => void;
}) {
  const { t } = useI18n();
  const canSubmit = localFilePath.trim().length > 0;

  return (
    <>
      <p className="text-body-sm leading-5 text-muted">
        {t.skills.createLocalDescription}
      </p>

      <div className="space-y-4">
        <div>
          <label
            className="block text-body-sm font-medium text-primary"
            htmlFor="skill-file-path"
          >
            {t.skills.skillFilePath}
          </label>
          <Input
            aria-describedby="skill-file-path-hint"
            autoFocus
            className="mt-1.5 font-ui-mono"
            disabled={creating}
            id="skill-file-path"
            onChange={(event) => setLocalFilePath(event.target.value)}
            placeholder={t.skills.skillFilePathPlaceholder}
            value={localFilePath}
          />
          <p
            className="mt-1 text-meta text-dim"
            id="skill-file-path-hint"
          >
            {t.skills.skillFilePathHint}
          </p>
        </div>

        <ScopeSelector
          projectName={projectName}
          scope={scope}
          setScope={setScope}
        />

        <Button
          block
          disabled={!canSubmit || creating}
          htmlType="button"
          icon={<Download />}
          loading={creating}
          onClick={() => void onCreate()}
          type="primary"
        >
          {creating ? t.skills.creating : t.skills.importSkill}
        </Button>
      </div>
    </>
  );
}

function ScopeSelector({
  projectName,
  scope,
  setScope,
}: {
  projectName: string;
  scope: "project" | "global";
  setScope: (scope: "project" | "global") => void;
}) {
  const { t } = useI18n();
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-xs font-medium text-primary">
        {t.skills.installationScope}
      </legend>
      <Radio.Group
        className="grid gap-2"
        name="skill-installation-scope"
        onChange={(event) =>
          setScope(event.target.value as "project" | "global")
        }
        options={(["project", "global"] as const).map((value) => ({
          className: "ant-radio-card",
          label: (
            <>
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
            </>
          ),
          value,
        }))}
        value={scope}
      />
    </fieldset>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
