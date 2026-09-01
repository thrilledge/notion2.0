// TypeScript types mirroring the Notion HTML/JSON export file format.

export interface NotionRichTextText {
  content: string;
  link?: { url: string } | null;
}

export interface NotionRichText {
  type: string;
  text?: NotionRichTextText;
  plain_text?: string;
  href?: string | null;
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
    code?: boolean;
    color?: string;
  };
}

export interface NotionPerson {
  id: string;
  name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
}

export interface NotionPropertyStatus {
  id?: string;
  name: string;
  color?: string;
}

export type NotionProperty = {
  id?: string;
  type: string;
  status?: NotionPropertyStatus | null;
  rich_text?: NotionRichText[];
  title?: NotionRichText[];
  date?: { start?: string | null; end?: string | null; time_zone?: string | null } | null;
  people?: NotionPerson[];
  files?: NotionFile[];
  select?: { name: string } | null;
  multi_select?: { name: string }[];
  url?: string | null;
  number?: number | null;
  checkbox?: boolean | null;
  created_by?: { id?: string; name?: string } | null;
  created_time?: string | null;
  last_edited_by?: { id?: string; name?: string } | null;
  last_edited_time?: string | null;
  verified?: boolean | null;
  owner?: NotionPerson[];
  email?: string | null;
  phone_number?: string | null;
};

export type NotionProperties = Record<string, NotionProperty>;

export interface NotionBlock {
  object?: string;
  id: string;
  type: string;
  has_children?: boolean;
  parent?: { type?: string; page_id?: string };
  created_time?: string;
  last_edited_time?: string;
  in_trash?: boolean;
  archived?: boolean;
  paragraph?: { rich_text?: NotionRichText[]; color?: string; [k: string]: unknown };
  bulleted_list_item?: { rich_text?: NotionRichText[]; color?: string; [k: string]: unknown };
  numbered_list_item?: { rich_text?: NotionRichText[]; color?: string; [k: string]: unknown };
  to_do?: { rich_text?: NotionRichText[]; checked?: boolean; color?: string; [k: string]: unknown };
  toggle?: { rich_text?: NotionRichText[]; [k: string]: unknown };
  heading_1?: { rich_text?: NotionRichText[]; color?: string };
  heading_2?: { rich_text?: NotionRichText[]; color?: string };
  heading_3?: { rich_text?: NotionRichText[]; color?: string };
  quote?: { rich_text?: NotionRichText[]; color?: string };
  callout?: { rich_text?: NotionRichText[]; color?: string; [k: string]: unknown };
  divider?: { [k: string]: unknown };
  code?: { rich_text?: NotionRichText[]; language?: string };
  image?: { caption?: NotionRichText[]; type?: string; file?: { url?: string }; external?: { url?: string }; [k: string]: unknown };
  video?: { caption?: NotionRichText[]; type?: string; file?: { url?: string }; external?: { url?: string } };
  file?: { name?: string; caption?: NotionRichText[]; type?: string; file?: { url?: string }; external?: { url?: string } };
  table?: { [k: string]: unknown };
  [k: string]: unknown;
}

export interface NotionFile {
  name?: string;
  type?: string;
  file?: { url?: string; expiry_time?: string };
  external?: { url?: string };
}

export interface NotionPage {
  id: string;
  type?: string;
  title?: string;
  created_time?: string | null;
  last_edited_time?: string | null;
  url?: string | null;
  icon?: { emoji?: string; type?: string; external?: { url?: string }; file?: { url?: string } } | null;
  cover?: { external?: { url?: string }; file?: { url?: string } } | null;
  parent?: {
    type?: string;
    database_id?: string;
    page_id?: string;
  };
  properties?: NotionProperties;
  blocks?: NotionBlock[];
}

export interface NotionDatabase {
  object?: string;
  id: string;
  title?: NotionRichText[] | string;
  properties?: Record<string, NotionColumnSchema>;
  parent?: { type?: string };
}

export interface NotionColumnSchema {
  id?: string;
  name: string;
  type: string;
  description?: string | null;
  status?: { options?: { id?: string; name: string; color?: string }[] };
  select?: { options?: { id?: string; name: string; color?: string }[] };
  multi_select?: { options?: { id?: string; name: string; color?: string }[] };
  [k: string]: unknown;
}

export interface NotionRowIndex {
  rows?: string[];
}
