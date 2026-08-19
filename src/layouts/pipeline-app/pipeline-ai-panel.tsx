"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Button, Input } from "antd";
import { ChevronDown, Send, Brain } from "@/components/icons";

export type AiMessageType = "user" | "assistant" | "thinking" | "tool_call" | "tool_result" | "error";

export type AiMessage = {
  id: string;
  type: AiMessageType;
  text: string;
  toolName?: string;
};

export type PipelineAiPanelProps = {
  messages: AiMessage[];
  inputValue: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  busy: boolean;
};

export function PipelineAiPanel({ messages, inputValue, onInputChange, onSend, busy }: PipelineAiPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!busy && inputValue.trim()) onSend();
    }
  };

  if (collapsed) {
    return (
      <div className="flex items-center justify-between border-t border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-1.5">
        <span className="text-xs text-[var(--pl-text-muted)]">{busy ? "AI: 处理中..." : "AI"}</span>
        <Button type="text" size="small" onClick={() => setCollapsed(false)} className="rotate-180" icon={<ChevronDown className="size-3.5" />} />
      </div>
    );
  }

  return (
    <div className="flex h-[240px] shrink-0 flex-col border-t border-[var(--pl-border)] bg-[var(--pl-surface)]">
      <div className="flex items-center justify-between border-b border-[var(--pl-border-glass)] px-4 py-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--pl-text-muted)]">AI</span>
        <Button type="text" size="small" icon={<ChevronDown className="size-3.5" />} onClick={() => setCollapsed(true)} />
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-[var(--pl-text-muted)]">输入指令让 AI 驱动 pipeline...</div>
        ) : (
          messages.map((msg) => <AiMessageItem key={msg.id} message={msg} />)
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="shrink-0 border-t border-[var(--pl-border-glass)] p-2">
        <div className="flex items-end gap-2">
          <Input.TextArea value={inputValue} onChange={(e) => onInputChange(e.target.value)} onKeyDown={handleKeyDown} placeholder="输入指令..." autoSize={{ minRows: 1, maxRows: 4 }} disabled={busy} className="flex-1" />
          <Button type="primary" size="small" icon={<Send className="size-3.5" />} onClick={onSend} loading={busy} disabled={!inputValue.trim() || busy} />
        </div>
      </div>
    </div>
  );
}

function AiMessageItem({ message }: { message: AiMessage }) {
  if (message.type === "user") {
    return (
      <div className="mb-2 rounded-lg bg-[var(--pl-accent-soft)] px-2.5 py-1.5 text-xs text-[var(--pl-text)]">{message.text}</div>
    );
  }
  if (message.type === "tool_call") {
    return (
      <div className="mb-2 flex items-center gap-1.5 text-xs text-[var(--pl-text-secondary)]">
        <Brain className="size-3 shrink-0 text-[var(--pl-accent)]" />
        <span className="font-mono">{message.toolName}</span>
        <span className="text-[var(--pl-text-muted)]">{message.text}</span>
      </div>
    );
  }
  if (message.type === "thinking") {
    return (
      <div className="mb-2 flex items-center gap-1.5 text-xs italic text-[var(--pl-text-muted)]">
        <Brain className="size-3 shrink-0" />
        <span>{message.text}</span>
      </div>
    );
  }
  if (message.type === "error") {
    return (
      <div className="mb-2 rounded-lg border border-[var(--pl-error)] px-2.5 py-1.5 text-xs text-[var(--pl-error)]">{message.text}</div>
    );
  }
  return (
    <div className="mb-2 px-1 text-xs text-[var(--pl-text-secondary)]">{message.text}</div>
  );
}

