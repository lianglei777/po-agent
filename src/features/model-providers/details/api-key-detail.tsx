"use client";

import { useState } from "react";
import { Button, Input } from "antd";
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
        <div className="flex items-center gap-1.5">
          <span
            className="h-[7px] w-[7px] rounded-full"
            style={{
              background: provider.configured
                ? "var(--success)"
                : "var(--border)",
            }}
          />
          <span
            className="text-meta"
            style={{
              color: provider.configured
                ? "var(--success)"
                : "var(--text-dim)",
            }}
          >
            {provider.configured ? t.models.configured : t.models.notConfigured}
          </span>
        </div>
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
          size="small"
          onClick={handleSave}
          disabled={saving || !apiKey.trim() || savedOk}
          htmlType="button"
          style={
            savedOk
              ? {
                  background: "var(--success)",
                  borderColor: "var(--success)",
                  color: "var(--primary-foreground)",
                }
              : undefined
          }
        >
          {savedOk && <CheckIcon />}
          {savedOk ? t.common.saved : saving ? t.common.saving : t.common.save}
        </Button>
      </div>

      {error && (
        <p className="text-xs text-destructive-text">
          {error}
        </p>
      )}

      {/* Disconnect button */}
      {provider.configured && (
        <Button
          danger
          htmlType="button"
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
            <p className="text-sm text-destructive-text" role="alert">
              {error}
            </p>
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
  const { t } = useI18n();

  return (
    <div className="relative" style={style}>
      <Input
        aria-label={label}
        size="small"
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="pr-9 font-ui-mono"
      />
      <Button
        aria-label={visible ? t.models.hideApiKey : t.models.showApiKey}
        className="absolute top-1/2 right-[5px] size-6 -translate-y-1/2 text-dim"
        htmlType="button"
        onClick={() => setUserVisible((v) => !v)}
        size="small"
        type="text"
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </Button>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.89 1 12a18.45 18.45 0 0 1 5.06-6.94" />
      <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.11 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <path d="M14.12 14.12A3 3 0 0 1 9.88 9.88" />
      <path d="M1 1l22 22" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      style={{
        strokeDasharray: 18,
        animation: "saved-check-draw 0.35s ease forwards",
      }}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
