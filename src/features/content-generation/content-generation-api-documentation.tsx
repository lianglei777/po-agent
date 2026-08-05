"use client";

import { useEffect, useState } from "react";
import { MarkdownDocument } from "@/components/ui/markdown-document";
import { Skeleton } from "@/components/ui/skeleton";
import { loadContentGenerationDocumentation } from "./api";

type DocumentationState =
  | { phase: "loading" }
  | { phase: "ready"; markdown: string }
  | { phase: "error" };

export function ContentGenerationApiDocumentation({
  catalogId,
  labels,
}: {
  catalogId?: string;
  labels: {
    loading: string;
    loadFailed: string;
    unavailable: string;
  };
}) {
  if (!catalogId) {
    return <p className="py-6 text-body-sm text-muted">{labels.unavailable}</p>;
  }
  return <LoadedDocumentation catalogId={catalogId} key={catalogId} labels={labels} />;
}

function LoadedDocumentation({
  catalogId,
  labels,
}: {
  catalogId: string;
  labels: {
    loading: string;
    loadFailed: string;
    unavailable: string;
  };
}) {
  const [state, setState] = useState<DocumentationState>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    void loadContentGenerationDocumentation(catalogId)
      .then(({ markdown }) => {
        if (!cancelled) setState({ phase: "ready", markdown });
      })
      .catch(() => {
        if (!cancelled) setState({ phase: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [catalogId]);
  if (state.phase === "error") {
    return <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-body-sm text-destructive-text">{labels.loadFailed}</p>;
  }
  if (state.phase === "loading") {
    return (
      <div aria-label={labels.loading} className="space-y-3 py-2">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="mt-5 h-40 w-full" />
      </div>
    );
  }
  return <MarkdownDocument markdown={state.markdown} />;
}
