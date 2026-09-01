"use client";

import { useRef, useState } from "react";
import {
  Bold,
  Code,
  Italic,
  Link as LinkIcon,
  Loader2,
  Plus,
  Strikethrough,
  Underline,
} from "lucide-react";
import type {
  ProjectContent,
  ProjectContentBlock,
} from "@/hooks/use-project-content";
import { useCreateBlock, useUpdateBlock } from "@/hooks/use-project-content";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";

type Row = {
  localId: string;
  blockId?: string;
  type: string;
  text: string;
  level?: number;
  checked?: boolean;
  spans?: ProjectContentBlock["content"]["spans"];
};

type SpanStyle = NonNullable<
  NonNullable<ProjectContentBlock["content"]["spans"]>
>[number];

function blockToRow(b: ProjectContentBlock): Row {
  return {
    localId: b.id,
    blockId: b.id,
    type: b.type,
    text: (b.content.text ?? "") as string,
    level: b.content.level as number | undefined,
    checked: (b.content.checked ?? false) as boolean,
    spans: b.content.spans,
  };
}

function isEditableType(type: string): boolean {
  return (
    type === "paragraph" ||
    type === "heading" ||
    type === "to_do" ||
    type === "bulleted_list" ||
    type === "numbered_list" ||
    type === "quote"
  );
}

let counter = 0;
function genId(): string {
  counter += 1;
  return `new-${Date.now()}-${counter}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function spansToHtml(spans?: SpanStyle[]): string {
  if (!spans || spans.length === 0) return "";
  return spans
    .map((s) => {
      let inner = escapeHtml(s.text).replace(/\n/g, "<br/>");
      if (s.code) inner = `<code>${inner}</code>`;
      if (s.bold) inner = `<b>${inner}</b>`;
      if (s.italic) inner = `<i>${inner}</i>`;
      if (s.underline) inner = `<u>${inner}</u>`;
      if (s.strikethrough) inner = `<s>${inner}</s>`;
      if (s.href)
        inner = `<a href="${escapeHtml(s.href)}" target="_blank" rel="noreferrer" class="text-blue-600 underline underline-offset-2 hover:text-blue-500">${inner}</a>`;
      return inner;
    })
    .join("");
}

function htmlToSpans(html: string): SpanStyle[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out: SpanStyle[] = [];

  type Inherited = Pick<
    SpanStyle,
    "bold" | "italic" | "underline" | "strikethrough" | "code" | "href"
  >;

  const walk = (node: Node, inherited: Inherited) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? "").replace(/\n/g, " ").replace(/\s+/g, " ").trimStart();
      if (text) out.push({ ...inherited, text });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === "br") {
      out.push({ ...inherited, text: " " });
      return;
    }
    const style: Inherited = { ...inherited };
    if (tag === "b" || tag === "strong") style.bold = true;
    if (tag === "i" || tag === "em") style.italic = true;
    if (tag === "u") style.underline = true;
    if (tag === "s" || tag === "strike" || tag === "del")
      style.strikethrough = true;
    if (tag === "code") style.code = true;
    if (tag === "a") style.href = el.getAttribute("href") ?? undefined;
    for (const child of Array.from(el.childNodes)) walk(child, style);
  };

  for (const child of Array.from(doc.body.childNodes)) walk(child, {});

  // merge adjacent spans with identical styles
  const merged: SpanStyle[] = [];
  for (const s of out) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      prev.bold === s.bold &&
      prev.italic === s.italic &&
      prev.underline === s.underline &&
      prev.strikethrough === s.strikethrough &&
      prev.code === s.code &&
      prev.href === s.href
    ) {
      prev.text += s.text;
    } else {
      merged.push({ ...s });
    }
  }
  return merged.filter((s) => s.text.length > 0);
}

function ToolbarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={active ? "secondary" : "ghost"}
          size="icon-sm"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClick}
          className={active ? "bg-accent text-foreground" : ""}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export function EditableBlocks({
  projectId,
  content,
}: {
  projectId: string;
  content: ProjectContent;
}) {
  const createBlock = useCreateBlock(projectId);
  const updateBlock = useUpdateBlock(projectId);
  const saving = createBlock.isPending || updateBlock.isPending;

  const [rows, setRows] = useState<Row[]>(() =>
    content.blocks
      .slice()
      .sort((a, b) => a.position - b.position)
      .map(blockToRow)
  );
  const [editingId, setEditingId] = useState<string | null>("__add__");
  const [activeStyle, setActiveStyle] = useState<{
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strikethrough: boolean;
    code: boolean;
  }>({ bold: false, italic: false, underline: false, strikethrough: false, code: false });

  const refs = useRef<Record<string, HTMLDivElement | null>>({});

  const setRowRef = (localId: string) => (el: HTMLDivElement | null) => {
    if (el) {
      refs.current[localId] = el;
    } else {
      delete refs.current[localId];
    }
  };

  const focusRow = (localId: string) => {
    setEditingId(localId);
    requestAnimationFrame(() => {
      const el = refs.current[localId];
      if (!el) return;
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    });
  };

  const insertRowAfter = (localId: string, text = "") => {
    const newId = genId();
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.localId === localId);
      const nr: Row = { localId: newId, type: "paragraph", text };
      const next = [...prev];
      if (idx === -1) next.push(nr);
      else next.splice(idx + 1, 0, nr);
      return next;
    });
    focusRow(newId);
  };

  const isInCode = () => {
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode) return false;
    let node: Node | null = sel.anchorNode;
    while (node && node !== refs.current[editingId ?? ""]) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = (node as HTMLElement).tagName.toLowerCase();
        if (tag === "code") return true;
      }
      node = node.parentNode;
    }
    return false;
  };

  const refreshActiveStyle = () => {
    setActiveStyle({
      bold: document.queryCommandState?.("bold") ?? false,
      italic: document.queryCommandState?.("italic") ?? false,
      underline: document.queryCommandState?.("underline") ?? false,
      strikethrough: document.queryCommandState?.("strikeThrough") ?? false,
      code: isInCode(),
    });
  };

  const saveRow = (row: Row) => {
    if (!row.blockId) return;
    const el = refs.current[row.localId];
    if (!el) return;
    const html = el.innerHTML;
    const spans = htmlToSpans(html);
    if (spans.every((s) => s.text.trim() === "")) return;
    updateBlock.mutate({ blockId: row.blockId, spans });
  };

  const createNewRow = (row: Row) => {
    const el = refs.current[row.localId];
    if (!el) return;
    const spans = htmlToSpans(el.innerHTML);
    if (spans.every((s) => s.text.trim() === "")) return;
    createBlock.mutate(
      { spans, type: "paragraph" },
      {
        onSuccess: (res) => {
          if (res?.data) {
            const newId = (res.data as ProjectContentBlock).id;
            setRows((prev) => {
              const idx = prev.findIndex((r) => r.localId === row.localId);
              const newRow = blockToRow(res.data);
              const next = [...prev];
              if (idx === -1) next.push(newRow);
              else next.splice(idx, 1, newRow);
              return next;
            });
            setEditingId(newId);
            requestAnimationFrame(() => {
              const el = refs.current[newId];
              if (el) el.focus();
            });
          }
        },
      }
    );
  };

  const runCommand = (cmd: string, value?: string) => {
    refs.current[editingId ?? ""]?.focus();
    document.execCommand(cmd, false, value);
    refreshActiveStyle();
  };

  const toggleCode = () => {
    refs.current[editingId ?? ""]?.focus();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      refreshActiveStyle();
      return;
    }
    if (isInCode()) {
      document.execCommand("removeFormat");
    } else {
      const html = `<code>${sel.toString()}</code>`;
      document.execCommand("insertHTML", false, html);
    }
    refreshActiveStyle();
  };

  const promptLink = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const url = window.prompt("Enter link URL");
    if (url) runCommand("createLink", url);
  };

  const activeRow = rows.find((r) => r.localId === editingId && r.blockId);

  const toolbar = (
    <div className="mb-1.5 flex items-center gap-0.5 rounded-md border bg-card p-1 shadow-sm">
      <ToolbarButton label="Bold" active={activeStyle.bold} onClick={() => runCommand("bold")}>
        <Bold className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton label="Italic" active={activeStyle.italic} onClick={() => runCommand("italic")}>
        <Italic className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton label="Underline" active={activeStyle.underline} onClick={() => runCommand("underline")}>
        <Underline className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton label="Strikethrough" active={activeStyle.strikethrough} onClick={() => runCommand("strikeThrough")}>
        <Strikethrough className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton label="Code" active={activeStyle.code} onClick={toggleCode}>
        <Code className="size-3.5" />
      </ToolbarButton>
      <Separator orientation="vertical" className="mx-0.5 h-5" />
      <ToolbarButton label="Link" onClick={promptLink}>
        <LinkIcon className="size-3.5" />
      </ToolbarButton>
    </div>
  );

  const renderRow = (row: Row, index: number) => {
    if (row.type === "divider") {
      return <div key={row.localId} className="my-1 h-px bg-border" />;
    }
    if (row.type === "image") {
      return <div key={row.localId} />;
    }
    if (!isEditableType(row.type)) {
      return (
        <div key={row.localId} className="py-0.5 text-sm leading-relaxed">
          {row.text}
        </div>
      );
    }

    const isAddRow = row.localId === "__add__";
    const isEditing = isAddRow || editingId === row.localId;

    const baseClass =
      "min-h-[1.5rem] w-full cursor-text border-0 bg-transparent p-0 outline-none focus-visible:ring-0 leading-relaxed text-sm";
    const style =
      row.type === "heading"
        ? row.level === 1
          ? "text-xl font-bold"
          : row.level === 2
            ? "text-lg font-semibold"
            : "text-base font-medium"
        : "";

    const editableField = (
      <div
        ref={setRowRef(row.localId)}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        className={`${baseClass} ${style} ${
          isAddRow ? "text-muted-foreground" : ""
        }`}
        data-placeholder="Add a line..."
        onKeyUp={refreshActiveStyle}
        onMouseUp={refreshActiveStyle}
        onSelect={refreshActiveStyle}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (isAddRow) {
              createNewRow(row);
            } else {
              saveRow(row);
              insertRowAfter(row.localId);
            }
          }
        }}
        onBlur={() => {
          if (isAddRow) createNewRow(row);
          else {
            saveRow(row);
            setEditingId(null);
          }
        }}
        dangerouslySetInnerHTML={{
          __html: isAddRow ? "" : spansToHtml(row.spans || [{ text: row.text }]),
        }}
      />
    );

    const readOnlyField = (
      <div
        className={`${baseClass} ${style}`}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) return;
          setEditingId(row.localId);
        }}
        dangerouslySetInnerHTML={{
          __html: spansToHtml(row.spans || [{ text: row.text }]),
        }}
      />
    );

    const body = isEditing ? editableField : readOnlyField;

    return (
      <div key={row.localId} className="group flex items-start gap-1.5">
        {row.type === "to_do" ? (
          <input
            type="checkbox"
            checked={row.checked ?? false}
            onChange={() => {
              const r = rows.find((x) => x.localId === row.localId);
              if (r?.blockId) {
                const newChecked = !(r.checked ?? false);
                setRows((prev) =>
                  prev.map((x) =>
                    x.localId === row.localId
                      ? { ...x, checked: newChecked }
                      : x
                  )
                );
                updateBlock.mutate({
                  blockId: r.blockId,
                  checked: newChecked,
                });
              }
            }}
            className="mt-1.5 size-4 shrink-0"
          />
        ) : null}
        {row.type === "bulleted_list" ? (
          <span className="mt-0.5 select-none text-muted-foreground">•</span>
        ) : row.type === "numbered_list" ? (
          <span className="mt-0.5 w-5 shrink-0 select-none text-right text-muted-foreground">
            {index + 1}.
          </span>
        ) : null}
        {body}
      </div>
    );
  };

  const list = [...rows, { localId: "__add__", type: "paragraph", text: "" }];

  return (
    <div className="relative">
      {saving && (
        <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> Saving...
        </div>
      )}
      {activeRow && toolbar}
      {list.map(renderRow)}
      <button
        type="button"
        onClick={() =>
          insertRowAfter(rows[rows.length - 1]?.localId ?? "__add__")
        }
        className="mt-1 flex items-center gap-1.5 rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Plus className="size-3" /> Add a line
      </button>
    </div>
  );
}
