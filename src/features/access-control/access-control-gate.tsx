"use client";

import { Lock } from "@/components/icons";
import type {
  AccessControlSessionResponse,
  AccessControlSessionState,
} from "@/contracts/access-control";
import { useI18n } from "@/i18n/use-i18n";
import { Alert, Button, Form, Input, Spin } from "antd";
import { useEffect, useState } from "react";
import {
  changeAccessControlPassword,
  loadAccessControlSession,
  loginAccessControl,
} from "./api";

export function AccessControlGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AccessControlSessionResponse | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let disposed = false;
    void loadAccessControlSession()
      .then((next) => !disposed && setSession(next))
      .catch((error) => !disposed && setLoadError(messageOf(error)));
    return () => {
      disposed = true;
    };
  }, []);

  if (loadError) {
    return (
      <AccessShell>
        <Alert showIcon title={loadError} type="error" />
        <Button className="mt-4" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </AccessShell>
    );
  }
  if (!session) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[var(--workspace-bg)]">
        <Spin size="large" />
      </div>
    );
  }
  if (allowsWorkspace(session.state)) return children;
  if (session.state === "password-change-required") {
    return <ChangePasswordScreen onChanged={setSession} />;
  }
  return <LoginScreen onLogin={setSession} />;
}

function LoginScreen({
  onLogin,
}: {
  onLogin: (session: AccessControlSessionResponse) => void;
}) {
  const { t } = useI18n();
  const labels = t.accessControl;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(values: { password: string }) {
    setSubmitting(true);
    setError("");
    try {
      onLogin(await loginAccessControl(values));
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AccessShell>
      <AccessHeader title={labels.loginTitle} description={labels.loginDescription} />
      <Form layout="vertical" onFinish={submit} requiredMark={false}>
        <Form.Item
          label={labels.password}
          name="password"
          rules={[{ required: true, message: labels.passwordRequired }]}
        >
          <Input.Password autoComplete="current-password" autoFocus />
        </Form.Item>
        {error ? <Alert className="mb-4" showIcon title={error} type="error" /> : null}
        <Button block htmlType="submit" loading={submitting} type="primary">
          {labels.login}
        </Button>
      </Form>
    </AccessShell>
  );
}

function ChangePasswordScreen({
  onChanged,
}: {
  onChanged: (session: AccessControlSessionResponse) => void;
}) {
  const { t } = useI18n();
  const labels = t.accessControl;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(values: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) {
    if (values.newPassword !== values.confirmPassword) {
      setError(labels.passwordMismatch);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      onChanged(await changeAccessControlPassword(values));
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AccessShell>
      <AccessHeader
        title={labels.changeRequiredTitle}
        description={labels.changeRequiredDescription}
      />
      <PasswordForm
        error={error}
        labels={labels}
        onFinish={submit}
        submitting={submitting}
      />
    </AccessShell>
  );
}

export function PasswordForm({
  error,
  labels,
  onFinish,
  submitting,
}: {
  error: string;
  labels: ReturnType<typeof useI18n>["t"]["accessControl"];
  onFinish: (values: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) => void | Promise<void>;
  submitting: boolean;
}) {
  return (
    <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
      <Form.Item label={labels.currentPassword} name="currentPassword" rules={[{ required: true }]}>
        <Input.Password autoComplete="current-password" />
      </Form.Item>
      <Form.Item
        extra={labels.passwordRules}
        label={labels.newPassword}
        name="newPassword"
        rules={[{ required: true, min: 8 }]}
      >
        <Input.Password autoComplete="new-password" />
      </Form.Item>
      <Form.Item label={labels.confirmPassword} name="confirmPassword" rules={[{ required: true }]}>
        <Input.Password autoComplete="new-password" />
      </Form.Item>
      {error ? <Alert className="mb-4" showIcon title={error} type="error" /> : null}
      <Button block htmlType="submit" loading={submitting} type="primary">
        {labels.changePassword}
      </Button>
    </Form>
  );
}

function AccessHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="mb-6 text-center">
      <span className="mx-auto mb-4 flex size-11 items-center justify-center rounded-control border border-line-strong bg-panel text-xl text-primary">
        <Lock />
      </span>
      <h1 className="text-lg font-semibold text-primary">{title}</h1>
      <p className="mt-1 text-body-sm text-muted">{description}</p>
    </header>
  );
}

function AccessShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex h-dvh items-center justify-center bg-[var(--workspace-bg)] px-6">
      <section className="w-full max-w-sm rounded-floating border border-line-strong bg-canvas p-7 shadow-floating">
        {children}
      </section>
    </main>
  );
}

function allowsWorkspace(state: AccessControlSessionState) {
  return state === "development-bypass" || state === "disabled" || state === "authenticated";
}

function messageOf(value: unknown) {
  return value instanceof Error ? value.message : "Request failed";
}
