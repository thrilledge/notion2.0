import type { NotionBlock, NotionRichText } from "./types";

export interface BlockSpan {
  text: string;
  href?: string | null;
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
  code?: boolean;
}

export interface BlockContent {
  text?: string;
  spans?: BlockSpan[];
  checked?: boolean;
  language?: string;
  level?: 1 | 2 | 3;
  url?: string | null;
  color?: string;
  originalType?: string;
  [k: string]: unknown;
}

/** Convert a rich_text array into plain text + denormalized spans. */
function richText(rt: NotionRichText[] | undefined | null): {
  text: string;
  spans: BlockSpan[];
} {
  const spans: BlockSpan[] = (rt ?? []).map((t) => ({
    text: t.plain_text ?? t.text?.content ?? "",
    href: t.href ?? null,
    bold: t.annotations?.bold ?? false,
    italic: t.annotations?.italic ?? false,
    strikethrough: t.annotations?.strikethrough ?? false,
    underline: t.annotations?.underline ?? false,
    code: t.annotations?.code ?? false,
  }));
  return { text: spans.map((s) => s.text).join(""), spans };
}

function firstUrl(block: NotionBlock): string | null {
  const field = block[block.type] as Record<string, unknown> | undefined;
  if (!field) return null;
  const file = field.file as { url?: string } | undefined;
  if (file?.url) return file.url;
  const external = field.external as { url?: string } | undefined;
  if (external?.url) return external.url;
  return null;
}

/**
 * Convert a Notion block into our normalized storage shape.
 * Returns null for blocks we cannot meaningfully represent.
 */
export function convertBlock(block: NotionBlock): {
  blockId: string;
  type: string;
  content: BlockContent;
  hasChildren: boolean;
} | null {
  const type = block.type;
  const field = block[type] as Record<string, unknown> | undefined;
  const hasChildren = block.has_children ?? false;

  switch (type) {
    case "paragraph": {
      const { text, spans } = richText((field?.rich_text as NotionRichText[]) ?? []);
      return { blockId: block.id, type: "paragraph", content: { text, spans }, hasChildren };
    }
    case "heading_1":
    case "heading_2":
    case "heading_3": {
      const { text, spans } = richText((field?.rich_text as NotionRichText[]) ?? []);
      return {
        blockId: block.id,
        type: "heading",
        content: { text, spans, level: Number(type.slice(-1)) as 1 | 2 | 3 },
        hasChildren,
      };
    }
    case "bulleted_list_item":
    case "numbered_list_item": {
      const { text, spans } = richText((field?.rich_text as NotionRichText[]) ?? []);
      return {
        blockId: block.id,
        type: type === "bulleted_list_item" ? "bulleted_list" : "numbered_list",
        content: { text, spans },
        hasChildren,
      };
    }
    case "to_do": {
      const { text, spans } = richText((field?.rich_text as NotionRichText[]) ?? []);
      return {
        blockId: block.id,
        type: "to_do",
        content: { text, spans, checked: Boolean(field?.checked) },
        hasChildren,
      };
    }
    case "toggle": {
      const { text, spans } = richText((field?.rich_text as NotionRichText[]) ?? []);
      return {
        blockId: block.id,
        type: "toggle",
        content: { text, spans, checked: false },
        hasChildren,
      };
    }
    case "quote": {
      const { text, spans } = richText((field?.rich_text as NotionRichText[]) ?? []);
      return { blockId: block.id, type: "quote", content: { text, spans }, hasChildren };
    }
    case "callout": {
      const { text, spans } = richText((field?.rich_text as NotionRichText[]) ?? []);
      return {
        blockId: block.id,
        type: "callout",
        content: { text, spans, color: (field?.color as string) ?? "default" },
        hasChildren,
      };
    }
    case "divider":
      return { blockId: block.id, type: "divider", content: {}, hasChildren: false };
    case "code": {
      const { text, spans } = richText((field?.rich_text as NotionRichText[]) ?? []);
      return {
        blockId: block.id,
        type: "code",
        content: { text, spans, language: (field?.language as string) ?? "plain text" },
        hasChildren,
      };
    }
    case "image": {
      const url = firstUrl(block);
      const caption = richText(
        (field?.caption as NotionRichText[]) ?? []
      ).text;
      return {
        blockId: block.id,
        type: "image",
        content: { url, caption: caption || undefined },
        hasChildren: false,
      };
    }
    case "file":
    case "video": {
      const url = firstUrl(block);
      const name = (field?.name as string) ?? type;
      return {
        blockId: block.id,
        type,
        content: { url, name },
        hasChildren: false,
      };
    }
    case "link_preview":
    case "embed":
    case "bookmark": {
      const url = firstUrl(block) ?? (field?.url as string | undefined) ?? null;
      return {
        blockId: block.id,
        type: "link_preview",
        content: { url },
        hasChildren: false,
      };
    }
    case "column_list":
    case "template":
    case "table":
      // Preserve raw so nothing is lost, mark as unsupported.
      return {
        blockId: block.id,
        type,
        content: { originalType: type, raw: field ?? {} },
        hasChildren,
      };
    default:
      return null;
  }
}
