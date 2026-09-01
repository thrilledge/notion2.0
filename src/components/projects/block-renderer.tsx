"use client";

import type { ProjectContentBlock } from "@/hooks/use-project-content";

function renderSpans(
  spans?: { text: string; href?: string | null; bold?: boolean; italic?: boolean; strikethrough?: boolean; underline?: boolean; code?: boolean }[]
) {
  if (!spans || spans.length === 0) return null;
  return (
    <>
      {spans.map((s, i) => {
        let node: React.ReactNode = s.text;
        if (s.bold) node = <strong>{node}</strong>;
        if (s.italic) node = <em>{node}</em>;
        if (s.underline) node = <u>{node}</u>;
        if (s.strikethrough) node = <s>{node}</s>;
        if (s.code) node = <code>{node}</code>;
        if (s.href)
          node = (
            <a
              href={s.href}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 underline hover:text-blue-500"
            >
              {node}
            </a>
          );
        return <span key={i}>{node}</span>;
      })}
    </>
  );
}

export function BlockView({ block }: { block: ProjectContentBlock }) {
  const c = block.content;
  switch (block.type) {
    case "heading": {
      const level = c.level ?? 1;
      const text = c.text || "";
      if (level === 1)
        return <h2 className="mt-5 mb-1 text-xl font-bold">{text}</h2>;
      if (level === 2)
        return <h3 className="mt-4 mb-1 text-lg font-semibold">{text}</h3>;
      return <h4 className="mt-3 mb-1 text-base font-medium">{text}</h4>;
    }
    case "to_do":
      return (
        <div className="flex items-start gap-2 py-0.5">
          <input
            type="checkbox"
            readOnly
            checked={c.checked ?? false}
            className="mt-1 size-4"
          />
          <span
            className={
              c.checked ? "text-muted-foreground line-through" : "text-foreground"
            }
          >
            {c.text}
          </span>
        </div>
      );
    case "bulleted_list":
      return (
        <li className="ml-4 list-disc py-0.5 marker:text-muted-foreground">
          {renderSpans(c.spans) ?? c.text}
        </li>
      );
    case "numbered_list":
      return (
        <li className="ml-4 list-decimal py-0.5 marker:text-muted-foreground">
          {renderSpans(c.spans) ?? c.text}
        </li>
      );
    case "quote":
      return (
        <blockquote className="border-l-2 pl-3 text-muted-foreground italic">
          {renderSpans(c.spans) ?? c.text}
        </blockquote>
      );
    case "callout":
      return (
        <div className="my-1 rounded-md bg-muted/60 px-3 py-2 text-sm">
          {renderSpans(c.spans) ?? c.text}
        </div>
      );
    case "code":
      return (
        <pre className="overflow-x-auto rounded-md bg-muted/70 p-3 text-sm">
          <code>{c.text}</code>
        </pre>
      );
    case "divider":
      return <div className="my-2 h-px bg-border" />;
    case "image":
      return c.url ? (
        <img
          src={c.url}
          alt={c.caption ?? ""}
          className="my-2 max-h-80 rounded-md object-contain"
        />
      ) : null;
    case "paragraph":
    default:
      return (
        <p className="py-0.5 leading-relaxed">
          {renderSpans(c.spans) ?? c.text}
        </p>
      );
  }
}
