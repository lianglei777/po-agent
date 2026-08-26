"use client";

import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  vscDarkPlus,
  vs,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import { Button } from "antd";
import { useI18n } from "@/i18n/use-i18n";

export function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const { t } = useI18n();
  const dark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");
  return (
    <div className="my-3 overflow-hidden rounded-floating border border-line-subtle bg-[var(--tool-bg)]">
      <div className="flex h-8 items-center border-b border-line-subtle px-3 text-caption text-muted">
        <span>{language}</span>
        <Button
          className="ml-auto h-6 px-2 text-caption"
          htmlType="button"
          onClick={() => void copyText(code).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          })}
          size="small"
          type="text"
        >
          {copied ? t.chat.message.copied : t.chat.message.copy}
        </Button>
      </div>
      <SyntaxHighlighter
        customStyle={{ margin: 0, background: "transparent", fontSize: "var(--fs-xs)" }}
        language={language}
        showLineNumbers
        style={dark ? vscDarkPlus : vs}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}
