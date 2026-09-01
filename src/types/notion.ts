export interface NotionRichText {
  type: "text";
  text: {
    content: string;
    link: string | null;
  };
  annotations: {
    bold: boolean;
    italic: boolean;
    strikethrough: boolean;
    underline: boolean;
    code: boolean;
    color: string;
  };
  plain_text: string;
  href: string | null;
}

export interface NotionBlock {
  object: "block";
  id: string;
  parent?: Record<string, unknown>;
  created_time?: string;
  created_by?: Record<string, unknown>;
  last_edited_time?: string;
  created_by_id?: string;
  last_edited_by_id?: string;
  type: string;
  has_children?: boolean;
  archived?: boolean;
  in_trash?: boolean;
  [key: string]: unknown;
}

export interface NotionPage {
  object: "page";
  id: string;
  created_time?: string;
  last_edited_time?: string;
  created_by?: Record<string, unknown>;
  last_edited_by?: Record<string, unknown>;
  cover?: Record<string, unknown> | null;
  icon?: Record<string, unknown> | null;
  parent?: Record<string, unknown> | null;
  archived?: boolean;
  in_trash?: boolean;
  properties?: Record<string, NotionProperty>;
  url?: string;
  public_url?: string | null;
  request_id?: string;
  [key: string]: unknown;
}

export type NotionProperty = {
  id?: string;
  type: string;
  [key: string]: unknown;
};

export type NotionDatabaseRow = NotionPage;
