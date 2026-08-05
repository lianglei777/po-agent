"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

export function MarkdownDocument({
  className,
  markdown,
}: {
  className?: string;
  markdown: string;
}) {
  const normalized = useMemo(
    () => markdown.replace(/<br\s*\/?\s*>/gi, " · "),
    [markdown],
  );

  return (
    <article
      className={cn(
        "min-w-0 text-body-sm leading-7 text-primary",
        "[&_a]:font-medium [&_a]:text-accent-deep [&_a]:underline [&_a]:underline-offset-2",
        "[&_blockquote]:my-5 [&_blockquote]:border-l-2 [&_blockquote]:border-line-strong [&_blockquote]:pl-4 [&_blockquote]:text-muted",
        "[&_hr]:my-8 [&_hr]:border-line-subtle",
        "[&_li]:my-1.5 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-6",
        "[&_p]:my-4 [&_strong]:font-semibold [&_ul]:my-4 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6",
        className,
      )}
    >
      <ReactMarkdown
        components={{
          a({ children, ...props }) {
            return <a {...props} rel="noreferrer" target="_blank">{children}</a>;
          },
          code({ className: codeClassName, children, ...props }) {
            const isBlock = Boolean(codeClassName) || String(children).includes("\n");
            return isBlock ? (
              <code className={cn("font-ui-mono text-meta", codeClassName)} {...props}>{children}</code>
            ) : (
              <code className="rounded bg-selected px-1.5 py-0.5 font-ui-mono text-[0.88em]" {...props}>{children}</code>
            );
          },
          h1({ children }) {
            return <h1 className="mt-2 mb-5 text-lg font-semibold tracking-tight text-primary">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="mt-9 mb-3 border-b border-line-subtle pb-2 text-base font-semibold tracking-tight text-primary">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="mt-7 mb-2 text-sm font-semibold text-primary">{children}</h3>;
          },
          h4({ children }) {
            return <h4 className="mt-6 mb-2 text-xs font-semibold text-primary">{children}</h4>;
          },
          pre({ children }) {
            return (
              <pre className="my-5 overflow-x-auto rounded-lg border border-line-subtle bg-subtle p-4 font-ui-mono text-meta leading-6 text-primary">
                {children}
              </pre>
            );
          },
          table({ children }) {
            return (
              <div className="my-5 overflow-x-auto rounded-lg border border-line-subtle">
                <table className="w-full min-w-[640px] border-collapse text-left text-xs">{children}</table>
              </div>
            );
          },
          td({ children }) {
            return <td className="border-t border-line-subtle px-3 py-2.5 align-top leading-5">{children}</td>;
          },
          th({ children }) {
            return <th className="bg-subtle px-3 py-2.5 font-semibold text-primary">{children}</th>;
          },
        }}
        remarkPlugins={[remarkGfm]}
      >
        {normalized}
      </ReactMarkdown>
    </article>
  );
}
