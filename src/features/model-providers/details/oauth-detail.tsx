"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, Input, Spin, Typography } from "antd";
import { logoutOAuth, submitOAuthInput } from "../api";
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
import type {
  OAuthLoginState,
  OAuthProvider,
  OAuthServerEvent,
} from "../types";

export default function OAuthDetail({
  provider,
}: {
  provider: OAuthProvider;
}) {
  const [state, setState] = useState<OAuthLoginState>({ phase: "idle" });
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState<boolean | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    return () => sourceRef.current?.close();
  }, []);

  function startLogin() {
    sourceRef.current?.close();
    setState({ phase: "connecting" });
    setInput("");
    const source = new EventSource(
      `/api/auth/login/${encodeURIComponent(provider.id)}`,
    );
    sourceRef.current = source;

    const onOAuthEvent = (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data) as OAuthServerEvent;
        switch (data.type) {
          case "auth":
            setState({
              phase: "auth",
              url: data.url,
              instructions: data.instructions,
            });
            window.open(data.url, "_blank", "noopener,noreferrer");
            break;
          case "device_code":
            setState({ phase: "device_code", ...data });
            window.open(
              data.verificationUri,
              "_blank",
              "noopener,noreferrer",
            );
            break;
          case "prompt":
            setInput("");
            setState({ phase: "prompt", ...data });
            break;
          case "select":
            setState({ phase: "select", ...data });
            break;
          case "progress":
            setState({ phase: "progress", message: data.message });
            break;
          case "complete":
            source.close();
            setConnected(true);
            setState({ phase: "success" });
            break;
          case "error":
            source.close();
            setState({ phase: "error", message: data.message });
            break;
        }
      } catch {
        setState({ phase: "error", message: t.models.invalidLoginResponse });
      }
    };

    source.addEventListener("oauth", onOAuthEvent);
    source.onerror = () => {
      source.close();
      setState((current) =>
        current.phase === "success"
          ? current
          : { phase: "error", message: t.models.connectionLost },
      );
    };
  }

  async function submit(token: string, value: string) {
    setState({ phase: "progress", message: t.models.verifying });
    try {
      await submitOAuthInput(provider.id, token, value);
    } catch (error) {
      setState({
        phase: "error",
        message: error instanceof Error ? error.message : t.models.failedToSubmit,
      });
    }
  }

  async function disconnect() {
    if (disconnecting) return;
    setDisconnecting(true);
    try {
      await logoutOAuth(provider.id);
      setConnected(false);
      setState({ phase: "idle" });
      setConfirmingDisconnect(false);
    } catch (error) {
      setState({
        phase: "error",
        message:
          error instanceof Error ? error.message : t.models.failedToDisconnect,
      });
    } finally {
      setDisconnecting(false);
    }
  }

  const working = !["idle", "success", "error"].includes(state.phase);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <SectionTitle>{t.models.subscription}</SectionTitle>
        <span className="text-meta text-dim">
          {connected === null
            ? t.models.statusUnavailable
            : connected
              ? t.models.connected
              : t.models.notConnected}
        </span>
      </div>

      <OAuthState state={state} input={input} setInput={setInput} submit={submit} />

      <div className="flex gap-2">
        {working ? (
          <Button
            htmlType="button"
            type="text"
            size="small"
            onClick={() => {
              sourceRef.current?.close();
              setState({ phase: "idle" });
            }}
          >
            {t.common.cancel}
          </Button>
        ) : (
          <>
            <Button
              htmlType="button"
              size="small"
              onClick={startLogin}
              type="primary"
            >
              {t.models.login}
            </Button>
            <Button
              danger
              htmlType="button"
              onClick={() => setConfirmingDisconnect(true)}
              size="small"
              type="primary"
            >
              {t.models.disconnect}
            </Button>
          </>
        )}
      </div>

      <Dialog
        open={confirmingDisconnect}
        onOpenChange={(open) => !open && setConfirmingDisconnect(false)}
      >
        <DialogContent
          className="z-[1101] sm:max-w-[420px]"
          closeLabel={t.common.close}
          overlayClassName="z-[1100]"
        >
          <DialogHeader>
            <DialogTitle>{t.models.disconnectOAuthTitle}</DialogTitle>
            <DialogDescription>
              {t.models.disconnectOAuthDescription.replace(
                "{provider}",
                provider.name,
              )}
            </DialogDescription>
          </DialogHeader>
          {state.phase === "error" ? (
            <Alert showIcon title={state.message} type="error" />
          ) : null}
          <DialogFooter>
            <Button
              autoFocus
              disabled={disconnecting}
              htmlType="button"
              onClick={() => setConfirmingDisconnect(false)}
            >
              {t.common.cancel}
            </Button>
            <Button
              danger
              disabled={disconnecting}
              htmlType="button"
              loading={disconnecting}
              onClick={() => void disconnect()}
              type="primary"
            >
              {disconnecting
                ? t.models.removing
                : t.models.disconnectOAuthAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OAuthState({
  state,
  input,
  setInput,
  submit,
}: {
  state: OAuthLoginState;
  input: string;
  setInput: (value: string) => void;
  submit: (token: string, value: string) => void;
}) {
  const { t } = useI18n();

  if (state.phase === "idle") {
    return <p className="text-body-sm text-muted">{t.models.connectOAuth}</p>;
  }
  if (state.phase === "connecting") {
    return <div className="flex items-center gap-2 text-body-sm text-muted"><Spin size="small" />{t.models.openingLogin}</div>;
  }
  if (state.phase === "auth") {
    return (
      <div className="flex flex-col gap-2 text-body-sm text-muted">
        {state.instructions && <p>{state.instructions}</p>}
        <Typography.Link href={state.url} target="_blank" rel="noreferrer">
          {t.models.openLoginPage}
        </Typography.Link>
      </div>
    );
  }
  if (state.phase === "device_code") {
    return (
      <div className="flex flex-col gap-2 text-body-sm text-muted">
        <p>{t.models.enterCode}</p>
        <code className="self-start rounded border border-line px-4 py-2 text-base font-bold">
          {state.userCode}
        </code>
        <Typography.Link href={state.verificationUri} target="_blank" rel="noreferrer">
          {state.verificationUri}
        </Typography.Link>
      </div>
    );
  }
  if (state.phase === "prompt") {
    const canSubmit = state.allowEmpty || input.trim().length > 0;
    return (
      <div className="flex flex-col gap-2">
        <p className="text-body-sm text-muted">{state.message}</p>
        <div className="flex gap-1.5">
          <Input
            autoFocus
            size="small"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={state.placeholder}
            className="flex-1"
          />
          <Button
            htmlType="button"
            size="small"
            disabled={!canSubmit}
            onClick={() => submit(state.token, input)}
            type="primary"
          >
            {t.models.submit}
          </Button>
        </div>
      </div>
    );
  }
  if (state.phase === "select") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-body-sm text-muted">{state.message}</p>
        {state.options.map((option) => (
          <Button
            key={option.id}
            htmlType="button"
            size="small"
            className="w-full justify-start!"
            onClick={() => submit(state.token, option.id)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    );
  }
  if (state.phase === "success") {
    return <Alert showIcon title={t.models.connectedSuccessfully} type="success" />;
  }
  if (state.phase === "progress") {
    return <div className="flex items-center gap-2 text-body-sm text-muted"><Spin size="small" />{state.message}</div>;
  }
  return (
    <Alert showIcon title={state.message} type="error" />
  );
}
