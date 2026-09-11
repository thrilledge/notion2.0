"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import {
  Bold,
  Check,
  Code,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  ListTodo,
  Loader2,
  Quote,
  Redo2,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
  Unlink,
  X,
} from "lucide-react";
import type { ProjectContentBlock } from "@/hooks/use-project-content";
import {
  useCreateBlocks,
  useUpdateBlock,
  useDeleteBlock,
} from "@/hooks/use-project-content";
import { sanitizeUrl } from "@/lib/security";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

type SpanStyle = NonNullable<
  NonNullable<ProjectContentBlock["content"]["spans"]>
>[number];

const EDITABLE_TYPES = [
  "paragraph",
  "heading_1",
  "heading_2",
  "heading_3",
  "to_do",
  "bulleted_list",
  "numbered_list",
  "quote",
];

type Row = {
  id: string;
  type: string;
  text: string;
  spans: SpanStyle[];
  checked?: boolean;
};

let counter = 0;
function genId(): string {
  counter += 1;
  return `new-${Date.now()}-${counter}`;
}

function isEditableType(type: string): boolean {
  return EDITABLE_TYPES.includes(type);
}

function blockToRow(b: ProjectContentBlock): Row {
  const spans: SpanStyle[] =
    b.content.spans ??
    (b.content.text ? [{ text: (b.content.text as string) ?? "" }] : []);
  return {
    id: b.id,
    type: b.type,
    text: spans.map((s) => s.text).join(""),
    spans,
    checked: (b.content.checked ?? false) as boolean,
  };
}

/** Convert a block's spans into ProseMirror inline content with marks. */
function spansToInline(spans: SpanStyle[]): JSONContent[] {
  if (!spans || spans.length === 0 || spans.every((s) => !s.text)) return [];
  return spans.map((s) => {
    const marks: NonNullable<JSONContent["marks"]> = [];
    if (s.bold) marks.push({ type: "bold" });
    if (s.italic) marks.push({ type: "italic" });
    if (s.underline) marks.push({ type: "underline" });
    if (s.strikethrough) marks.push({ type: "strike" });
    if (s.code) marks.push({ type: "code" });
    const href = sanitizeUrl(s.href);
    if (href) marks.push({ type: "link", attrs: { href } });
    return { type: "text", text: s.text, ...(marks.length > 0 ? { marks } : {}) };
  });
}

/** Convert ProseMirror inline content back into block spans. */
function inlinesToSpans(content?: JSONContent[] | null): SpanStyle[] {
  const spans: SpanStyle[] = [];
  for (const node of content ?? []) {
    const n = node as { type?: string; text?: string; marks?: { type: string; attrs?: { href?: string } }[] };
    if (n.type !== "text") continue;
    const marks = new Map((n.marks ?? []).map((m) => [m.type, m.attrs]));
    spans.push({
      text: n.text ?? "",
      bold: marks.has("bold") || undefined,
      italic: marks.has("italic") || undefined,
      underline: marks.has("underline") || undefined,
      strikethrough: marks.has("strike") || undefined,
      code: marks.has("code") || undefined,
      href: marks.has("link") ? marks.get("link")?.href ?? undefined : undefined,
    });
  }
  return spans.filter((s) => s.text.length > 0);
}

/** Build a Tiptap JSON document from the editable server rows. */
function rowsToDoc(blocks: ProjectContentBlock[]) {
  const rows = blocks
    .slice()
    .sort((a, b) => a.position - b.position)
    .filter((b) => isEditableType(b.type))
    .map(blockToRow);

  const content: JSONContent[] = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    const inline = spansToInline(row.spans);

    if (row.type.startsWith("heading_")) {
      const level = Number(row.type.slice(-1));
      content.push({ type: "heading", attrs: { level }, content: inline });
      i += 1;
    } else if (row.type === "quote") {
      content.push({
        type: "blockquote",
        content: [{ type: "paragraph", content: inline }],
      });
      i += 1;
    } else if (
      row.type === "bulleted_list" ||
      row.type === "numbered_list" ||
      row.type === "to_do"
    ) {
      const group = [] as Row[];
      while (i < rows.length && rows[i].type === row.type) {
        group.push(rows[i]);
        i += 1;
      }
      const listItems = group.map((b) => {
        const itemInline = spansToInline(b.spans);
        if (row.type === "to_do") {
          return {
            type: "taskItem" as const,
            attrs: { checked: b.checked ?? false },
            content: [{ type: "paragraph", content: itemInline }],
          };
        }
        return {
          type: "listItem" as const,
          content: [{ type: "paragraph", content: itemInline }],
        };
      });
      content.push({
        type:
          row.type === "bulleted_list"
            ? "bulletList"
            : row.type === "numbered_list"
              ? "orderedList"
              : "taskList",
        content: listItems,
      });
    } else {
      content.push({ type: "paragraph", content: inline });
      i += 1;
    }
  }

  if (content.length === 0) {
    // Empty page: lay down a canvas of blank lines so clicking line 4, 5,
    // … places the caret on that exact line. (Blank paragraphs are real
    // blocks, matching how the rest of the document persists.)
    for (let n = 0; n < EMPTY_PAGE_LINES; n += 1) {
      content.push({ type: "paragraph" });
    }
  }
  return { type: "doc", content };
}

/** Number of blank lines shown when a page has no content yet, so the user
 *  can click any line (4th, 5th, …) and start writing there instead of
 *  being forced onto the first line. */
const EMPTY_PAGE_LINES = 20;

/** Convert a Tiptap JSON document back into editable block rows. */
function docToRows(doc: { content?: JSONContent[] }): Row[] {
  const rows: Row[] = [];
  const push = (
    type: string,
    inline?: JSONContent | JSONContent[],
    extra?: { checked?: boolean }
  ) => {
    const contentArray = Array.isArray(inline) ? inline : inline?.content;
    const spans = inlinesToSpans(contentArray);
    rows.push({
      id: genId(),
      type,
      text: spans.map((s) => s.text).join(""),
      spans,
      checked: extra?.checked ?? false,
    });
  };

  for (const node of doc.content ?? []) {
    const n = node as JSONContent & {
      attrs?: { level?: number; checked?: boolean };
    };
    switch (n.type) {
      case "heading": {
        const level = Math.min(Math.max(n.attrs?.level ?? 1, 1), 3);
        push(`heading_${level}`, n);
        break;
      }
      case "blockquote": {
        const inner = (n.content?.[0] as JSONContent | undefined)?.content;
        push("quote", inner);
        break;
      }
      case "bulletList":
        for (const item of n.content ?? []) {
          const first = (item as JSONContent).content?.[0];
          push("bulleted_list", first ?? item);
        }
        break;
      case "orderedList":
        for (const item of n.content ?? []) {
          const first = (item as JSONContent).content?.[0];
          push("numbered_list", first ?? item);
        }
        break;
      case "taskList":
        for (const item of n.content ?? []) {
          const it = item as JSONContent & { attrs?: { checked?: boolean } };
          const first = it.content?.[0];
          push("to_do", first ?? item, { checked: it.attrs?.checked ?? false });
        }
        break;
      default:
        push("paragraph", n);
    }
  }

  if (rows.length === 0) push("paragraph");
  return rows;
}

/**
 * Merge the fresh editable rows back into the full baseline while preserving
 * non-editable rows (images, dividers, …) in their original positions.
 */
function mergeWithBaseline(baseline: Row[], freshEditable: Row[]): Row[] {
  const existingIds = baseline.filter((b) => isEditableType(b.type)).map((b) => b.id);
  const assigned = freshEditable.map((r, ix) =>
    ix < existingIds.length ? { ...r, id: existingIds[ix] } : r
  );

  const out: Row[] = [];
  let editableCursor = 0;
  for (const b of baseline) {
    if (isEditableType(b.type)) {
      if (editableCursor < assigned.length) out.push(assigned[editableCursor]);
      editableCursor += 1;
    } else {
      out.push(b);
    }
  }
  while (editableCursor < assigned.length) {
    out.push(assigned[editableCursor]);
    editableCursor += 1;
  }
  return out;
}

export function RichTextEditor({
  projectId,
  blocks,
}: {
  projectId: string;
  blocks: ProjectContentBlock[];
}) {
  const createBlocks = useCreateBlocks(projectId);
  const updateBlock = useUpdateBlock(projectId);
  const deleteBlock = useDeleteBlock(projectId);

  const baselineRef = useRef<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const savedCountRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Serialize save passes: while a pass (creates + updates) is still landing,
  // queue the latest editor so the next diff runs only after the created rows
  // have been mapped back to their real DB ids.
  const savingRef = useRef(false);
  const pendingEditorRef = useRef<Editor | null>(null);

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const linkInputRef = useRef<HTMLInputElement | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialDoc = useMemo(() => rowsToDoc(blocks), []);

  const openLinkPopoverRef = useRef<() => void>(() => {});

  const extensions = useMemo(
    () => [
      StarterKit.configure({ codeBlock: false }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
      }),
      Underline,
      TaskList,
      TaskItem.configure({ nested: false }),
      Placeholder.configure({
        placeholder: ({ node }) =>
          node.type.name === "heading" ? "Heading" : "Add a line...",
      }),
    ],
    []
  );

  const editorProps = useMemo(
    () => ({
      attributes: {
        class:
          "tiptap min-h-[50rem] w-full text-sm leading-relaxed text-foreground",
      },
      handleKeyDown(_view: unknown, event: KeyboardEvent) {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
          event.preventDefault();
          openLinkPopoverRef.current();
          return true;
        }
        return false;
      },
    }),
    []
  );

  const persistRef = useRef<(editor: Editor) => void>(() => {});

  persistRef.current = (editor: Editor) => {
      if (savingRef.current) {
        // A save pass is in flight — remember the latest editor state and
        // run it once the current pass finishes (so created rows get their
        // real DB ids before the next diff is computed).
        pendingEditorRef.current = editor;
        return;
      }
      savingRef.current = true;

      const fresh = docToRows(editor.getJSON());
      const merged = mergeWithBaseline(baselineRef.current, fresh);

      const creates: Row[] = [];
      const updates: { id: string; row: Row }[] = [];
      const deletes: string[] = [];

      for (let ix = 0; ix < merged.length; ix += 1) {
        const row = merged[ix];
        const old = baselineRef.current[ix];
        const equiv =
          old &&
          old.id === row.id &&
          old.type === row.type &&
          old.checked === row.checked &&
          JSON.stringify(old.spans) === JSON.stringify(row.spans);
        if (!old) {
          creates.push(row);
        } else if (!equiv) {
          updates.push({ id: old.id, row });
        }
      }
      for (let ix = merged.length; ix < baselineRef.current.length; ix += 1) {
        const gone = baselineRef.current[ix];
        if (isEditableType(gone.type)) deletes.push(gone.id);
      }

      if (creates.length === 0 && updates.length === 0 && deletes.length === 0) {
        baselineRef.current = merged;
        savingRef.current = false;
        if (pendingEditorRef.current) {
          const next = pendingEditorRef.current;
          pendingEditorRef.current = null;
          persistRef.current(next);
        }
        return;
      }

      const totalOps =
        (creates.length > 0 ? 1 : 0) + updates.length + deletes.length;
      savedCountRef.current = 0;

      const markDone = () => {
        savedCountRef.current += 1;
        if (savedCountRef.current >= totalOps) {
          setSaving(false);
          savingRef.current = false;
          if (pendingEditorRef.current) {
            const next = pendingEditorRef.current;
            pendingEditorRef.current = null;
            persistRef.current(next);
          }
        }
      };

      setSaving(true);
      baselineRef.current = merged;

      if (creates.length > 0) {
        // Batched, transactional create: one request for every new line so
        // positions can't race on max+1 and rows can't be dropped. The server
        // echoes the client row key back with the real DB id.
        createBlocks.mutate(
          {
            blocks: creates.map((row) => ({
              spans: row.spans,
              type: row.type === "paragraph" ? "paragraph" : row.type,
              clientKey: row.id,
            })),
          },
          {
            onSuccess: (created) => {
              const rows = created?.data as
                | { id: string; clientKey?: string }[]
                | undefined;
              if (rows?.length) {
                baselineRef.current = baselineRef.current.map((r) => {
                  const match = rows.find(
                    (row) => row.clientKey === r.id
                  );
                  return match ? { ...r, id: match.id } : r;
                });
              }
            },
            onSettled: markDone,
          }
        );
      }
      for (const { id, row } of updates) {
        updateBlock.mutate(
          {
            blockId: id,
            spans: row.spans,
            checked: row.type === "to_do" ? row.checked : undefined,
            type: row.type,
          },
          { onSettled: markDone }
        );
      }
      for (const id of deletes) {
        deleteBlock.mutate(id, { onSettled: markDone });
      }
  };

  useEffect(() => {
    if (linkOpen) requestAnimationFrame(() => linkInputRef.current?.focus());
  }, [linkOpen]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const editorRef = useRef<Editor | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    editorProps,
    extensions,
    content: initialDoc,
    onUpdate: ({ editor: ed }) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => persistRef.current(ed), 600);
    },
  });

  const initialBlocksRef = useRef(blocks);

  useEffect(() => {
    editorRef.current = editor;
    if (editor) {
      baselineRef.current = initialBlocksRef.current
        .slice()
        .sort((a, b) => a.position - b.position)
        .map(blockToRow);
      openLinkPopoverRef.current = () => {
        setLinkUrl((editor.getAttributes("link").href as string) ?? "");
        setLinkOpen(true);
      };
    }
  }, [editor]);

  const applyLink = () => {
    const ed = editorRef.current;
    setLinkOpen(false);
    if (!ed) return;
    const href = sanitizeUrl(linkUrl.trim());
    if (!href) return;
    ed.chain().focus().extendMarkRange("link").setLink({ href }).run();
  };

  const removeLink = () => {
    const ed = editorRef.current;
    setLinkOpen(false);
    if (!ed) return;
    ed.chain().focus().extendMarkRange("link").unsetLink().run();
  };

  const run = (fn: (e: Editor) => void) => {
    const ed = editorRef.current;
    if (!ed) return;
    fn(ed);
  };

  if (!editor) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" /> Loading editor...
      </div>
    );
  }

  const activeHeading =
    (editor.isActive("heading", { level: 1 })
      ? "h1"
      : editor.isActive("heading", { level: 2 })
        ? "h2"
        : editor.isActive("heading", { level: 3 })
          ? "h3"
          : "p");

  return (
    <div className="relative" data-rich-text-editor>
      {saving && (
        <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> Saving...
        </div>
      )}

      <div className="mb-1.5 flex flex-wrap items-center gap-0.5 rounded-md border bg-card p-1 shadow-sm">
        <select
          value={activeHeading}
          onChange={(e) => {
            const v = e.target.value;
            run((ed) =>
              v === "p"
                ? ed.chain().focus().setParagraph().run()
                : ed
                    .chain()
                    .focus()
                    .toggleHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 })
                    .run()
            );
          }}
          className="h-7 rounded-md border border-transparent bg-transparent px-1 text-sm hover:bg-muted focus-visible:outline-none"
          aria-label="Block type"
        >
          <option value="p">Paragraph</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        <ToolbarButton label="Bold" active={editor.isActive("bold")} onClick={() => run((e) => e.chain().focus().toggleBold().run())}>
          <Bold className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Italic" active={editor.isActive("italic")} onClick={() => run((e) => e.chain().focus().toggleItalic().run())}>
          <Italic className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Underline" active={editor.isActive("underline")} onClick={() => run((e) => e.chain().focus().toggleUnderline().run())}>
          <UnderlineIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Strikethrough" active={editor.isActive("strike")} onClick={() => run((e) => e.chain().focus().toggleStrike().run())}>
          <Strikethrough className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Code" active={editor.isActive("code")} onClick={() => run((e) => e.chain().focus().toggleCode().run())}>
          <Code className="size-3.5" />
        </ToolbarButton>

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        <ToolbarButton label="Bullet list" active={editor.isActive("bulletList")} onClick={() => run((e) => e.chain().focus().toggleBulletList().run())}>
          <List className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Numbered list" active={editor.isActive("orderedList")} onClick={() => run((e) => e.chain().focus().toggleOrderedList().run())}>
          <ListOrdered className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Task list" active={editor.isActive("taskList")} onClick={() => run((e) => e.chain().focus().toggleTaskList().run())}>
          <ListTodo className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Quote" active={editor.isActive("blockquote")} onClick={() => run((e) => e.chain().focus().toggleBlockquote().run())}>
          <Quote className="size-3.5" />
        </ToolbarButton>

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        <ToolbarButton label="Link (Ctrl+K)" active={editor.isActive("link")} onClick={() => openLinkPopoverRef.current()}>
          <LinkIcon className="size-3.5" />
        </ToolbarButton>

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        <ToolbarButton label="Undo" onClick={() => run((e) => e.chain().focus().undo().run())}>
          <Undo2 className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Redo" onClick={() => run((e) => e.chain().focus().redo().run())}>
          <Redo2 className="size-3.5" />
        </ToolbarButton>
      </div>

      {linkOpen && (
        <div className="mb-1.5 flex items-center gap-1.5 rounded-md border bg-card p-1.5 shadow-sm">
          <LinkIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <Input
            ref={linkInputRef}
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onFocus={(e) => e.target.select()}
            placeholder="https://example.com"
            className="h-7 flex-1 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              } else if (e.key === "Escape") {
                setLinkOpen(false);
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            className="h-7"
            onMouseDown={(e) => e.preventDefault()}
            onClick={applyLink}
          >
            <Check className="size-3.5" />
            {editor.isActive("link") ? "Update" : "Add"}
          </Button>
          {editor.isActive("link") && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7"
              onMouseDown={(e) => e.preventDefault()}
              onClick={removeLink}
            >
              <Unlink className="size-3.5" />
              Remove
            </Button>
          )}
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="h-7"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const ed = editorRef.current;
              setLinkOpen(false);
              ed?.commands.focus();
            }}
            aria-label="Close link dialog"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      )}

      <div
        className="w-full"
        onClick={(e) => {
          const ed = editorRef.current;
          const target = e.target as HTMLElement | null;
          if (!ed || !target) return;
          // Clicking the editor's blank area (below/lines without a block) should
          // move the caret to the end so typing continues there instead of
          // jumping back to the very first line.
          if (
            target.classList?.contains("tiptap") &&
            !target.closest("p, h1, h2, h3, li, ul, ol, blockquote")
          ) {
            ed.commands.focus("end");
          }
        }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
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
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="icon-sm"
      aria-label={label}
      title={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={active ? "bg-accent text-foreground" : ""}
    >
      {children}
    </Button>
  );
}