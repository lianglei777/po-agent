"use client";

import { SettingsRow } from "@/components/ui/settings-form";
import type { AccessControlSettingsResponse } from "@/contracts/access-control";
import { useI18n } from "@/i18n/use-i18n";
import { Alert, App, Button, Input, Modal, Skeleton, Switch } from "antd";
import { useEffect, useState } from "react";
import { PasswordForm } from "./access-control-gate";
import {
  changeAccessControlPassword,
  loadAccessControlSettings,
  logoutAccessControl,
  updateAccessControlSettings,
} from "./api";

export function AccessControlSettings() {
  const { t } = useI18n();
  const labels = t.accessControl;
  const { message } = App.useApp();
  const [settings, setSettings] = useState<AccessControlSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [changeError, setChangeError] = useState("");
  const [changing, setChanging] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<boolean | null>(null);
  const [togglePassword, setTogglePassword] = useState("");
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    let disposed = false;
    void loadAccessControlSettings()
      .then((next) => !disposed && setSettings(next))
      .catch((cause) => !disposed && setError(messageOf(cause)))
      .finally(() => !disposed && setLoading(false));
    return () => {
      disposed = true;
    };
  }, []);

  async function changePassword(values: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) {
    if (values.newPassword !== values.confirmPassword) {
      setChangeError(labels.passwordMismatch);
      return;
    }
    setChanging(true);
    setChangeError("");
    try {
      await changeAccessControlPassword(values);
      void message.success(labels.passwordChanged);
      window.location.reload();
    } catch (cause) {
      setChangeError(messageOf(cause));
    } finally {
      setChanging(false);
    }
  }

  async function applyToggle() {
    if (toggleTarget === null) return;
    setToggling(true);
    setError("");
    try {
      const next = await updateAccessControlSettings({
        enabled: toggleTarget,
        currentPassword: togglePassword,
      });
      setSettings(next);
      setToggleTarget(null);
      setTogglePassword("");
      window.location.reload();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setToggling(false);
    }
  }

  return (
    <main className="min-w-0 flex-1 overflow-y-auto px-10 py-8">
      <div className="mx-auto max-w-4xl">
        <header className="border-b border-line-subtle pb-5">
          <h1 className="text-lg font-semibold text-primary">{labels.settingsTitle}</h1>
          <p className="mt-1 max-w-[65ch] text-body-sm text-muted">{labels.settingsDescription}</p>
        </header>
        {loading ? <Skeleton active className="py-6" paragraph={{ rows: 6 }} /> : null}
        {!loading && settings ? (
          <div className="space-y-8 py-6">
            {settings.developmentBypass ? (
              <Alert showIcon title={labels.developmentBypass} type="info" />
            ) : null}
            <section className="overflow-hidden rounded-floating border border-line-subtle bg-panel">
              <SettingsRow
                description={labels.loginVerificationDescription}
                label={labels.loginVerification}
                contentMaxWidth={220}
              >
                <Switch
                  checked={settings.enabled}
                  disabled={settings.developmentBypass}
                  onChange={(enabled) => setToggleTarget(enabled)}
                  size="small"
                />
              </SettingsRow>
            </section>
            {!settings.developmentBypass ? (
              <section>
                <h2 className="text-sm font-semibold text-primary">{labels.changePassword}</h2>
                <p className="mt-1 mb-4 text-body-sm text-muted">{labels.changePasswordDescription}</p>
                <div className="max-w-sm">
                  <PasswordForm
                    error={changeError}
                    labels={labels}
                    onFinish={changePassword}
                    submitting={changing}
                  />
                </div>
              </section>
            ) : null}
            {settings.enabled && !settings.developmentBypass ? (
              <section className="border-t border-line-subtle pt-6">
                <Button
                  onClick={() => void logoutAccessControl().then(() => window.location.reload())}
                >
                  {labels.logout}
                </Button>
              </section>
            ) : null}
            {error ? <Alert showIcon title={error} type="error" /> : null}
          </div>
        ) : null}
      </div>
      <Modal
        cancelText={t.common.cancel}
        closable
        confirmLoading={toggling}
        mask={{ closable: false }}
        okButtonProps={{ disabled: !togglePassword }}
        okText={t.common.confirm}
        onCancel={() => {
          setToggleTarget(null);
          setTogglePassword("");
        }}
        onOk={() => void applyToggle()}
        open={toggleTarget !== null}
        title={toggleTarget ? labels.enableLoginVerification : labels.disableLoginVerification}
      >
        <p className="mb-4 text-body-sm text-muted">
          {toggleTarget ? labels.enableConfirm : labels.disableConfirm}
        </p>
        <Input.Password
          autoComplete="current-password"
          onChange={(event) => setTogglePassword(event.target.value)}
          placeholder={labels.currentPassword}
          value={togglePassword}
        />
      </Modal>
    </main>
  );
}

function messageOf(value: unknown) {
  return value instanceof Error ? value.message : "Request failed";
}
