"use client";

import { useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useDocs, useDoc } from "@/hooks/use-docs";
import { PageDocument } from "@/components/shared/page-document";

export function DocsPage() {
  const { data: docs = [], isLoading } = useDocs();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const effectiveId = useMemo(() => {
    if (selectedId && docs.some((d) => d.id === selectedId)) return selectedId;
    return docs[0]?.id ?? null;
  }, [selectedId, docs]);

  const docDetail = useDoc(effectiveId);
  const selected = useMemo(
    () => docs.find((d) => d.id === effectiveId) ?? null,
    [docs, effectiveId]
  );

  return (
    <div className="flex h-[calc(100vh-2rem)] overflow-hidden rounded-lg border bg-background">
      {/* Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col border-r">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Docs</h2>
          <p className="text-xs text-muted-foreground">{docs.length} documents</p>
        </div>
        <nav className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="space-y-2 p-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          )}
          {docs.map((doc) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => setSelectedId(doc.id)}
              className={cn(
                "flex w-full flex-col gap-0.5 px-4 py-2.5 text-left transition-colors",
                doc.id === effectiveId
                  ? "bg-muted"
                  : "hover:bg-muted/50"
              )}
            >
              <span className="text-sm font-medium">{doc.title}</span>
              <span className="flex flex-wrap gap-1">
                {doc.tags.map((t) => (
                  <Badge
                    key={t}
                    variant="secondary"
                    className="border-transparent bg-muted px-1.5 py-0 text-[10px] text-muted-foreground"
                  >
                    {t}
                  </Badge>
                ))}
              </span>
            </button>
          ))}
          {!isLoading && docs.length === 0 && (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              No documents found.
            </p>
          )}
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        {!selected ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select a document to view its content.
          </div>
        ) : docDetail.isLoading ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        ) : (
          <div className="mx-auto max-w-[760px] px-8 py-8">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded text-muted-foreground">
                <FileText className="size-5" />
              </span>
            </div>
            <h1 className="mb-1 text-3xl font-bold tracking-tight">
              {selected.title}
            </h1>
            <div className="mb-8 flex flex-wrap items-center gap-2">
              {selected.tags.map((t) => (
                <Badge key={t} variant="secondary">
                  {t}
                </Badge>
              ))}
            </div>
            <PageDocument blocks={docDetail.data?.blocks ?? []} />
          </div>
        )}
      </main>
    </div>
  );
}
