"use client";

export type ProjectExportRow = {
  name: string;
  type: string;
  status: string;
  result?: string;
  summary?: string;
  comments?: string;
  dueDate?: string;
  assigneeEmail?: string;
};

export type ProjectImportItem = {
  name: string;
  type?: "client" | "side_project";
  status?: "not_started" | "in_progress" | "done" | "archived";
  result?:
    | "company_work"
    | "not_started"
    | "stuck"
    | "pending_review"
    | "in_progress"
    | "upcoming_renewal"
    | "done";
  summary?: string | null;
  comments?: string | null;
  dueDate?: string | null;
  assigneeEmail?: string | null;
};

function toDateString(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function toExportRows(
  projects: {
    name: string;
    type: string;
    status: string;
    result?: string | null;
    summary?: string | null;
    comments?: string | null;
    dueDate?: string | Date | null;
    assigneeIds?: string[];
  }[],
  emailById: Map<string, string>
): ProjectExportRow[] {
  return projects.map((p) => {
    const firstAssignee = p.assigneeIds?.[0];
    return {
      name: p.name,
      type: p.type,
      status: p.status,
      result: p.result ?? undefined,
      summary: p.summary ?? undefined,
      comments: p.comments ?? undefined,
      dueDate: toDateString(p.dueDate),
      assigneeEmail: firstAssignee ? emailById.get(firstAssignee) ?? undefined : undefined,
    };
  });
}

const EXPORT_COLUMNS = [
  "name",
  "type",
  "status",
  "result",
  "summary",
  "comments",
  "dueDate",
  "assigneeEmail",
] as const;

function escapeCsv(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function rowsToCsv(rows: ProjectExportRow[]): string {
  const lines = [EXPORT_COLUMNS.map((c) => escapeCsv(c)).join(",")];
  for (const row of rows) {
    lines.push(
      EXPORT_COLUMNS.map((c) => escapeCsv(row[c as keyof ProjectExportRow])).join(",")
    );
  }
  return lines.join("\r\n");
}

export function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (cell.length > 0 || row.length > 0) {
        row.push(cell);
        rows.push(row);
      }
      cell = "";
      row = [];
      if (ch === "\r" && text[i + 1] === "\n") i++;
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] ?? "";
    });
    return obj;
  });
}

export async function parseImportFile(
  file: File
): Promise<ProjectImportItem[]> {
  const text = await file.text();
  const lower = file.name.toLowerCase();

  let raw: Record<string, string>[];
  if (lower.endsWith(".csv")) {
    raw = parseCsv(text);
  } else if (lower.endsWith(".json")) {
    const parsed = JSON.parse(text);
    const arr = Array.isArray(parsed) ? parsed : (parsed as { items?: unknown[] }).items;
    if (!Array.isArray(arr)) throw new Error("JSON must be an array or {items:[...]}");
    raw = arr as unknown as Record<string, string>[];
  } else {
    if (text.trim().startsWith("[")) {
      const parsed = JSON.parse(text);
      raw = Array.isArray(parsed) ? parsed : [];
    } else {
      raw = parseCsv(text);
    }
  }

  return raw.map((r) => ({
    name: (r.name ?? "").trim(),
    type: (r.type as ProjectImportItem["type"]) || undefined,
    status: (r.status as ProjectImportItem["status"]) || undefined,
    result: (r.result as ProjectImportItem["result"]) || undefined,
    summary: r.summary?.trim() || null,
    comments: r.comments?.trim() || null,
    dueDate: r.dueDate?.trim() || null,
    assigneeEmail: r.assigneeEmail?.trim() || null,
  }));
}
