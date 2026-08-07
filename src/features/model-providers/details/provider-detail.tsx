"use client";

import { useEffect, useRef, useState } from "react";
import { EyeInvisibleOutlined, EyeOutlined } from "@ant-design/icons";
import { Button, Checkbox, Input, Select } from "antd";
import {
  API_OPTIONS,
  type ModelDiscoverySuggestion,
  type ProviderEntry,
} from "../types";
import { useI18n } from "@/i18n/use-i18n";
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
import { CompatEditor } from "./compat-editor";
import { changeEntryApi } from "./compat-editor-state";

interface Props {
  name: string;
  provider: ProviderEntry;
  onChange: (p: ProviderEntry) => void;
  onRename: (oldName: string, newName: string) => void;
  onDelete: (name: string) => void;
  discovery: DiscoveryState;
  onDiscoverModels: (providerName: string) => void;
  onAcceptDiscoveredModels: (
    providerName: string,
    selected: ModelDiscoverySuggestion[],
  ) => void;
}

type DiscoveryState =
  | { phase: "idle" }
  | { phase: "discovering"; providerName: string }
  | {
      phase: "result";
      providerName: string;
      models: ModelDiscoverySuggestion[];
      remoteError?: string;
    }
  | { phase: "error"; providerName: string; message: string };

export default function ProviderDetail({
  name,
  provider,
  onChange,
  onRename,
  onDelete,
  discovery,
  onDiscoverModels,
  onAcceptDiscoveredModels,
}: Props) {
  const [editingName, setEditingName] = useState(name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { t } = useI18n();

  const canRename = editingName !== name && editingName.trim().length > 0;

  return (
    <div className="mx-auto flex w-full max-w-[920px] flex-col gap-6 pb-6">
      <header>
        <SectionTitle>{t.models.provider}</SectionTitle>
        <h1 className="mt-1 truncate font-ui-mono text-lg font-semibold text-primary">
          {name}
        </h1>
      </header>

      <Dialog
        open={confirmingDelete}
        onOpenChange={(open) => !open && setConfirmingDelete(false)}
      >
        <DialogContent
          className="z-[1101] sm:max-w-[420px]"
          closeLabel={t.common.close}
          overlayClassName="z-[1100]"
        >
          <DialogHeader>
            <DialogTitle>{t.models.deleteProviderTitle}</DialogTitle>
            <DialogDescription>
              {t.models.deleteProviderDescription.replace("{provider}", name)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              autoFocus
              htmlType="button"
              onClick={() => setConfirmingDelete(false)}
            >
              {t.common.cancel}
            </Button>
            <Button
              danger
              htmlType="button"
              onClick={() => {
                setConfirmingDelete(false);
                onDelete(name);
              }}
              type="primary"
            >
              {t.models.deleteProviderAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SettingsSection title={t.models.general}>
        <SettingsRow label={t.models.providerName} labelFor="provider-name">
          <div className="flex items-center gap-2">
            <Input
              size="small"
              id="provider-name"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              className="min-w-0 flex-1 font-ui-mono"
            />
            {canRename && (
              <Button
                className="shrink-0"
                htmlType="button"
                onClick={() => onRename(name, editingName.trim())}
                size="small"
              >
                {t.models.rename}
              </Button>
            )}
          </div>
        </SettingsRow>

        <SettingsRow
          label={t.models.baseUrl}
          labelFor="provider-base-url"
          contentMaxWidth={400}
        >
          <Input
            size="small"
            id="provider-base-url"
            value={provider.baseUrl ?? ""}
            onChange={(e) => onChange({ ...provider, baseUrl: e.target.value })}
            placeholder="https://api.example.com/v1"
            className="font-ui-mono"
          />
        </SettingsRow>

        <SettingsRow
          label={t.models.apiKey}
          labelFor="provider-api-key"
          contentMaxWidth={400}
        >
          <SecretTextInput
            id="provider-api-key"
            value={provider.apiKey ?? ""}
            onChange={(v) => onChange({ ...provider, apiKey: v })}
            placeholder={t.models.apiKeyPlaceholder}
            mono
          />
        </SettingsRow>

        <SettingsRow label={t.models.apiProtocol} labelFor="provider-api-protocol">
          <Select
            className={provider.api ? "text-primary" : "text-dim"}
            id="provider-api-protocol"
            onChange={(value) => onChange(changeEntryApi(provider, value))}
            options={API_OPTIONS.map((option) => ({ label: option, value: option }))}
            value={provider.api ?? ""}
          />
        </SettingsRow>
      </SettingsSection>

      <ModelDiscoveryPanel
        providerName={name}
        provider={provider}
        discovery={discovery}
        onDiscoverModels={onDiscoverModels}
        onAcceptDiscoveredModels={onAcceptDiscoveredModels}
      />

      <CompatEditor
        api={provider.api}
        compat={provider.compat}
        onChange={(compat) => onChange({ ...provider, compat })}
      />

      <SettingsSection title={t.models.dangerZone}>
        <SettingsRow
          label={t.common.delete}
          description={t.models.deleteProviderRowDescription}
        >
          <div className="flex justify-end">
            <Button
              danger
              htmlType="button"
              onClick={() => setConfirmingDelete(true)}
              size="small"
              type="primary"
            >
              {t.common.delete}
            </Button>
          </div>
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}

function ModelDiscoveryPanel({
  providerName,
  provider,
  discovery,
  onDiscoverModels,
  onAcceptDiscoveredModels,
}: {
  providerName: string;
  provider: ProviderEntry;
  discovery: DiscoveryState;
  onDiscoverModels: (providerName: string) => void;
  onAcceptDiscoveredModels: (
    providerName: string,
    selected: ModelDiscoverySuggestion[],
  ) => void;
}) {
  const { t } = useI18n();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const relevant =
    discovery.phase !== "idle" && discovery.providerName === providerName
      ? discovery
      : null;
  const discovering = relevant?.phase === "discovering";
  const resultModels = relevant?.phase === "result" ? relevant.models : null;

  // 发现结果变化时重置选择（默认不选）
  const lastResultRef = useRef(resultModels);
  useEffect(() => {
    if (lastResultRef.current !== resultModels) {
      lastResultRef.current = resultModels;
      setSelectedIds(new Set());
    }
  }, [resultModels]);

  const existingIds = new Set((provider.models ?? []).map((model) => model.id));
  const newSuggestions = resultModels
    ? resultModels.filter((suggestion) => !existingIds.has(suggestion.model.id))
    : [];
  const existingHiddenCount = resultModels
    ? resultModels.length - newSuggestions.length
    : 0;
  const selectedSuggestions = newSuggestions.filter((suggestion) =>
    selectedIds.has(suggestion.model.id),
  );
  const allSelected =
    newSuggestions.length > 0 &&
    newSuggestions.every((suggestion) =>
      selectedIds.has(suggestion.model.id),
    );

  const toggleModel = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(
        new Set(newSuggestions.map((suggestion) => suggestion.model.id)),
      );
    }
  };

  return (
    <SettingsSection title={t.models.modelList}>
      <div className="flex items-center justify-between gap-4 px-4 py-3.5">
        <div className="min-w-0">
          <div className="text-xs font-medium text-primary">
            {t.models.addModels}
          </div>
          <p className="mt-1 max-w-[62ch] text-meta leading-4 text-dim">
            {t.models.discoverModelsDescription}
          </p>
        </div>
        <Button
          className="shrink-0"
          disabled={discovering}
          htmlType="button"
          onClick={() => onDiscoverModels(providerName)}
          size="small"
        >
          {discovering ? t.models.discoveringModels : t.models.fetchModelList}
        </Button>
      </div>

      {relevant?.phase === "error" && (
        <p className="border-t border-line-subtle px-4 py-3 text-xs text-destructive-text">
          {relevant.message}
        </p>
      )}

      {relevant?.phase === "result" && (
        <div className="space-y-2 border-t border-line-subtle px-4 py-3.5">
          {relevant.remoteError && (
            <p className="text-xs text-dim">
              {t.models.remoteDiscoveryFailed}: {relevant.remoteError}
            </p>
          )}
          {newSuggestions.length === 0 ? (
            <p className="text-xs text-dim">
              {existingHiddenCount > 0
                ? t.models.allDiscoveredModelsExist
                : t.models.noDiscoveredModels}
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-dim">
                  {t.models.selectedCount} {selectedSuggestions.length} /{" "}
                  {newSuggestions.length}
                </span>
                <Button
                  htmlType="button"
                  onClick={toggleAll}
                  size="small"
                  type="text"
                >
                  {allSelected
                    ? t.models.clearSelection
                    : t.models.selectDiscovered}
                </Button>
              </div>
              <div className="max-h-[168px] overflow-y-auto rounded border border-line">
                {newSuggestions.map((suggestion) => {
                  const checked = selectedIds.has(suggestion.model.id);
                  return (
                    <label
                      key={suggestion.model.id}
                      className="flex cursor-pointer items-center gap-2 border-b border-line px-2.5 py-2 last:border-b-0 hover:bg-hover"
                    >
                      <Checkbox
                        checked={checked}
                        onChange={() => toggleModel(suggestion.model.id)}
                      />
                      <span className="min-w-0 flex-1 truncate font-ui-mono text-meta text-primary">
                        {suggestion.model.id}
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="flex items-center justify-end gap-3">
                {existingHiddenCount > 0 && (
                  <span className="mr-auto text-meta text-dim">
                    {existingHiddenCount} {t.models.existingHidden}
                  </span>
                )}
                <Button
                  htmlType="button"
                  disabled={selectedSuggestions.length === 0}
                  onClick={() => {
                    onAcceptDiscoveredModels(providerName, selectedSuggestions);
                    setSelectedIds(new Set());
                  }}
                  size="small"
                >
                  {t.models.addSelected} ({selectedSuggestions.length})
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </SettingsSection>
  );
}

function SecretTextInput({
  id,
  value,
  onChange,
  placeholder,
  mono,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  const [userVisible, setUserVisible] = useState(false);
  const visible = userVisible && value !== "";
  const { t } = useI18n();

  return (
    <Input.Password
      autoComplete="off"
      className={mono ? "font-ui-mono" : undefined}
      iconRender={(isVisible) =>
        isVisible ? (
          <EyeInvisibleOutlined aria-label={t.models.hideApiKey} />
        ) : (
          <EyeOutlined aria-label={t.models.showApiKey} />
        )
      }
      id={id}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      size="small"
      spellCheck={false}
      value={value}
      visibilityToggle={{
        visible,
        onVisibleChange: setUserVisible,
      }}
    />
  );
}
