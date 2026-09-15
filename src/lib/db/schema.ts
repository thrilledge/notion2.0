import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  bigint,
  doublePrecision,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    fullName: text("full_name"),
    avatarUrl: text("avatar_url"),
    role: text("role", {
      enum: ["owner", "admin", "member", "guest"],
    })
      .notNull()
      .default("member"),
    status: text("status", {
      enum: ["active", "deactivated"],
    })
      .notNull()
      .default("active"),
    notionUserId: text("notion_user_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)]
);

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    createdById: uuid("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("workspaces_created_idx").on(t.createdById)]
);

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", {
      enum: ["owner", "member"],
    })
      .notNull()
      .default("member"),
    lastSeenAt: timestamp("last_seen_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index("workspace_members_user_idx").on(t.userId),
    index("workspace_members_role_idx").on(t.role),
  ]
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    type: text("type", {
      enum: ["client", "side_project"],
    })
      .notNull()
      .default("client"),
    status: text("status", {
      enum: ["not_started", "in_progress", "done", "archived"],
    })
      .notNull()
      .default("not_started"),
    result: text("result", {
      enum: [
        "company_work",
        "not_started",
        "stuck",
        "pending_review",
        "in_progress",
        "upcoming_renewal",
        "done",
      ],
    }),
    summary: text("summary"),
    comments: text("comments"),
    dueDate: timestamp("due_date"),
    assigneeId: uuid("assignee_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdById: uuid("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    notionPageId: text("notion_page_id").unique(),
    sortOrder: doublePrecision("sort_order").notNull().default(0),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("projects_status_idx").on(t.status),
    index("projects_assignee_idx").on(t.assigneeId),
    index("projects_type_idx").on(t.type),
    index("projects_workspace_idx").on(t.workspaceId),
    index("projects_deleted_idx").on(t.deletedAt),
    uniqueIndex("projects_notion_idx").on(t.notionPageId),
  ]
);

export const projectAssignees = pgTable(
  "project_assignees",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.userId] }),
    index("project_assignees_user_idx").on(t.userId),
  ]
);

export const hostingClients = pgTable(
  "hosting_clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    domain: text("domain").notNull(),
    clientName: text("client_name"),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    status: text("status", {
      enum: ["not_started", "in_progress", "done", "archived"],
    })
      .notNull()
      .default("not_started"),
    result: text("result", {
      enum: [
        "company_work",
        "not_started",
        "stuck",
        "pending_review",
        "in_progress",
        "upcoming_renewal",
        "done",
      ],
    }),
    summary: text("summary"),
    comments: text("comments"),
    text: text("text"),
    dueDate: timestamp("due_date"),
    assigneeId: uuid("assignee_id").references(() => users.id, {
      onDelete: "set null",
    }),
    notionPageId: text("notion_page_id").unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("hosting_status_idx").on(t.status),
    index("hosting_assignee_idx").on(t.assigneeId),
    index("hosting_project_idx").on(t.projectId),
    uniqueIndex("hosting_notion_idx").on(t.notionPageId),
  ]
);

export const folders = pgTable(
  "folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["project", "hosting_client"] })
      .notNull()
      .default("project"),
    // System folders get a stable code ("all_projects", "side_projects",
    // "hosting_clients"); custom folders have NULL. Used to derive default
    // content so nothing is ever lost for the system views.
    code: text("code"),
    sortOrder: doublePrecision("sort_order").notNull().default(0),
    createdById: uuid("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("folders_workspace_idx").on(t.workspaceId),
    uniqueIndex("folders_workspace_code_idx").on(t.workspaceId, t.code),
  ]
);

/** Explicit memberships for custom folders. System folders derive content. */
export const folderProjects = pgTable(
  "folder_projects",
  {
    folderId: uuid("folder_id")
      .notNull()
      .references(() => folders.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.folderId, t.projectId] }),
    index("folder_projects_folder_idx").on(t.folderId),
    index("folder_projects_project_idx").on(t.projectId),
  ]
);

/** Explicit memberships for custom hosting-client folders. */
export const folderHostingClients = pgTable(
  "folder_hosting_clients",
  {
    folderId: uuid("folder_id")
      .notNull()
      .references(() => folders.id, { onDelete: "cascade" }),
    hostingClientId: uuid("hosting_client_id")
      .notNull()
      .references(() => hostingClients.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.folderId, t.hostingClientId] }),
    index("folder_hosting_folder_idx").on(t.folderId),
    index("folder_hosting_client_idx").on(t.hostingClientId),
  ]
);

/** Per-folder user access. A user only sees folders they are granted. */
export const folderAccess = pgTable(
  "folder_access",
  {
    folderId: uuid("folder_id")
      .notNull()
      .references(() => folders.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.folderId, t.userId] }),
    index("folder_access_user_idx").on(t.userId),
  ]
);

export type PageParentType =
  | "project"
  | "hosting_client"
  | "doc"
  | "meeting"
  | "wiki"
  | "standalone";

export const pages = pgTable(
  "pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    parentType: text("parent_type", {
      enum: [
        "project",
        "hosting_client",
        "doc",
        "meeting",
        "wiki",
        "standalone",
      ],
    }).notNull(),
    parentId: uuid("parent_id"),
    iconEmoji: text("icon_emoji"),
    iconUrl: text("icon_url"),
    coverUrl: text("cover_url"),
    content: jsonb("content").$type<unknown[]>(),
    position: integer("position").notNull().default(0),
    createdById: uuid("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedById: uuid("updated_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    notionPageId: text("notion_page_id").unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("pages_parent_idx").on(t.parentType, t.parentId),
    uniqueIndex("pages_notion_idx").on(t.notionPageId),
  ]
);

export const pageBlocks = pgTable(
  "page_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    blockId: text("block_id").notNull(),
    type: text("type").notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    parentBlockId: uuid("parent_block_id"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("page_blocks_page_idx").on(t.pageId),
    uniqueIndex("page_blocks_block_idx").on(t.pageId, t.blockId),
  ]
);

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id").references(() => pages.id, {
      onDelete: "cascade",
    }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    hostingClientId: uuid("hosting_client_id").references(
      () => hostingClients.id,
      { onDelete: "cascade" }
    ),
    storage: text("storage", {
      enum: ["local", "r2"],
    })
      .notNull()
      .default("local"),
    storageKey: text("storage_key").notNull(),
    publicUrl: text("public_url"),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type"),
    size: bigint("size", { mode: "number" }),
    propertyName: text("property_name"),
    position: integer("position").notNull().default(0),
    uploadedById: uuid("uploaded_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("attachments_page_idx").on(t.pageId),
    index("attachments_project_idx").on(t.projectId),
    index("attachments_hosting_idx").on(t.hostingClientId),
  ]
);

export const docs = pgTable(
  "docs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    tags: text("tags").array().default(sql`'{}'::text[]`),
    pageId: uuid("page_id").references(() => pages.id, {
      onDelete: "set null",
    }),
    createdById: uuid("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedById: uuid("updated_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("docs_page_idx").on(t.pageId)]
);

export const meetings = pgTable(
  "meetings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    type: text("type", {
      enum: ["standup", "brainstorm", "team_weekly", "training"],
    }).notNull(),
    eventTime: timestamp("event_time"),
    pageId: uuid("page_id").references(() => pages.id, {
      onDelete: "set null",
    }),
    createdById: uuid("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("meetings_page_idx").on(t.pageId)]
);

export const meetingAttendees = pgTable(
  "meeting_attendees",
  {
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.meetingId, t.userId] })]
);

export const wikiPages = pgTable(
  "wiki_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    pageId: uuid("page_id").references(() => pages.id, {
      onDelete: "set null",
    }),
    tags: text("tags").array().default(sql`'{}'::text[]`),
    ownerId: uuid("owner_id").references(() => users.id, {
      onDelete: "set null",
    }),
    verified: boolean("verified").notNull().default(false),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("wiki_page_idx").on(t.pageId)]
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: ["assignment", "comment", "due", "system"],
    }).notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId),
    index("notifications_read_idx").on(t.userId, t.readAt),
  ]
);

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    email: text("email").notNull(),
    role: text("role", {
      enum: ["owner", "member"],
    })
      .notNull()
      .default("member"),
    invitedById: uuid("invited_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    acceptedAt: timestamp("accepted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("invitations_email_idx").on(t.email),
    index("invitations_workspace_idx").on(t.workspaceId),
  ]
);

export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    action: text("action", {
      enum: ["create", "update", "delete"],
    }).notNull(),
    changes: jsonb("changes").$type<Record<string, unknown>>(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("activity_entity_idx").on(t.entityType, t.entityId),
    index("activity_user_idx").on(t.userId),
    index("activity_created_idx").on(t.createdAt),
  ]
);

export type ProjectAssignee = typeof projectAssignees.$inferSelect;
export type NewProjectAssignee = typeof projectAssignees.$inferInsert;
export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type NewWorkspaceMember = typeof workspaceMembers.$inferInsert;
export type WorkspaceRole = "owner" | "member";
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type HostingClient = typeof hostingClients.$inferSelect;
export type NewHostingClient = typeof hostingClients.$inferInsert;
export type Page = typeof pages.$inferSelect;
export type NewPage = typeof pages.$inferInsert;
export type PageBlock = typeof pageBlocks.$inferSelect;
export type NewPageBlock = typeof pageBlocks.$inferInsert;
export type Attachment = typeof attachments.$inferSelect;
export type NewAttachment = typeof attachments.$inferInsert;
export type Doc = typeof docs.$inferSelect;
export type NewDoc = typeof docs.$inferInsert;
export type Meeting = typeof meetings.$inferSelect;
export type NewMeeting = typeof meetings.$inferInsert;
export type WikiPage = typeof wikiPages.$inferSelect;
export type ActivityLog = typeof activityLog.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
export type Folder = typeof folders.$inferSelect;
export type NewFolder = typeof folders.$inferInsert;
export type FolderAccess = typeof folderAccess.$inferSelect;
export type NewFolderAccess = typeof folderAccess.$inferInsert;
export type FolderProject = typeof folderProjects.$inferSelect;
export type FolderHostingClient = typeof folderHostingClients.$inferSelect;
