"use client";

import { useState } from "react";
import { Alert, Button, Input, Tag } from "antd";
import { Check } from "@/components/icons";
import { removeApiKey, saveApiKey } from "../api";
import {
  type ApiKeyProvider,
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
import { SectionTitle } from "@/components/ui/settings-form";

interface Props {
  provider: ApiKeyProvider;
  onRefresh: () => void;
}

export default function ApiKeyDetail({ provider, onRefresh }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const { t } = useI18n();

  async function handleSave() {
    if (!apiKey.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await saveApiKey(provider.id, apiKey.trim());
      setApiKey("");
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.models.failedToSave);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!provider.configured) return;
    setRemoving(true);
    try {
      await removeApiKey(provider.id);
      await onRefresh();
      setConfirmingRemove(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.models.failedToRemove);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <SectionTitle>{t.models.apiKey}</SectionTitle>
        <Tag color={provider.configured ? "success" : undefined} variant="filled">
            {provider.configured ? t.models.configured : t.models.notConfigured}
        </Tag>
      </div>

      {/* Description */}
      <p className="text-body-sm text-muted">
        {provider.configured
          ? t.models.apiKeyStored
          : `${t.models.enterApiKeyPrefix} ${provider.name} ${t.models.enterApiKeyMiddle} ${provider.modelCount} ${
              provider.modelCount === 1
                ? t.models.modelSingular
                : t.models.modelPlural
            }`}
      </p>

      {/* Input + Save */}
      <div className="flex gap-1.5">
        <SecretTextInput
          label={t.models.apiKey}
          value={apiKey}
          onChange={setApiKey}
          onKeyDown={(e) => {
            if (e.key === "Enter" && apiKey.trim()) handleSave();
          }}
          placeholder={
            provider.configured
              ? t.models.enterNewKey
              : "sk-..."
          }
          style={{ flex: 1 }}
        />
        <Button
          disabled={saving || !apiKey.trim() || savedOk}
          htmlType="button"
          icon={savedOk ? <Check /> : undefined}
          loading={saving}
          onClick={handleSave}
          size="small"
          type="primary"
        >
          {savedOk ? t.common.saved : saving ? t.common.saving : t.common.save}
        </Button>
      </div>

      {error && (
        <Alert showIcon title={error} type="error" />
      )}

      {/* Disconnect button */}
      {provider.configured && (
        <Button
          danger
          htmlType="button"
          loading={removing}
          onClick={() => setConfirmingRemove(true)}
          disabled={removing}
          className="self-start"
          size="small"
          type="primary"
        >
          {removing ? t.models.removing : t.models.disconnect}
        </Button>
      )}

      <Dialog
        open={confirmingRemove}
        onOpenChange={(open) => !open && setConfirmingRemove(false)}
      >
        <DialogContent
          className="z-[1101] sm:max-w-[420px]"
          closeLabel={t.common.close}
          overlayClassName="z-[1100]"
        >
          <DialogHeader>
            <DialogTitle>{t.models.removeApiKeyTitle}</DialogTitle>
            <DialogDescription>
              {t.models.removeApiKeyDescription.replace(
                "{provider}",
                provider.name,
              )}
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <Alert showIcon title={error} type="error" />
          ) : null}
          <DialogFooter>
            <Button
              autoFocus
              disabled={removing}
              htmlType="button"
              onClick={() => setConfirmingRemove(false)}
            >
              {t.common.cancel}
            </Button>
            <Button
              danger
              disabled={removing}
              htmlType="button"
              loading={removing}
              onClick={() => void handleRemove()}
              type="primary"
            >
              {removing ? t.models.removing : t.models.removeApiKeyAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SecretTextInput({
  label,
  value,
  onChange,
  onKeyDown,
  placeholder,
  style,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  const [userVisible, setUserVisible] = useState(false);
  const visible = userVisible && value !== "";

  return (
    <div style={style}>
      <Input.Password
        aria-label={label}
        autoComplete="off"
        className="font-ui-mono"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        size="small"
        spellCheck={false}
        value={value}
        visibilityToggle={{
          visible,
          onVisibleChange: setUserVisible,
        }}
      />
    </div>
  );
}
