const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

/**
 * Allow only safe link protocols. Used before rendering user-supplied URLs in
 * <a href>, <img src>, form actions and redirect targets so that values like
 * `javascript:...` or `data:text/html,...` can never reach the DOM.
 */
export function sanitizeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Internal / relative references are fine.
  if (trimmed.startsWith("#") || trimmed.startsWith("/")) {
    // Block protocol-relative URLs (`//evil.com`) in redirect-style contexts;
    // as link hrefs they are harmless, so normalize them here too.
    if (trimmed.startsWith("//")) return null;
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    return SAFE_PROTOCOLS.has(parsed.protocol) ? trimmed : null;
  } catch {
    return null;
  }
}

/**
 * A redirect destination coming from a query string (`next`, `redirect`) must
 * start with a single `/`, must not be an external URL or protocol-relative
 * URL, and must not embed a hostile scheme.
 */
export function isSafeRedirectPath(value: string | null | undefined): boolean {
  if (!value) return false;
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  if (value.includes("\\") || value.includes("%5c")) return false;
  // First path segment must not carry a scheme (`/javascript:...`).
  const first = value.slice(1).split("/")[0];
  return !first.includes(":");
}

/** Hard cap for any single uploaded file (mirrors the R2 presign limit). */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".avif",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".txt",
  ".csv",
  ".md",
  ".json",
  ".zip",
  ".mp4",
  ".webm",
  ".mp3",
  ".wav",
]);

/**
 * Reject uploads whose extension is not on the allowlist. Content sniffing is
 * intentionally conservative: unknown types are blocked before they reach disk.
 */
export function isAllowedUpload(filename: string): boolean {
  const name = filename.toLowerCase();
  const dot = name.lastIndexOf(".");
  if (dot === -1) return false;
  return ALLOWED_UPLOAD_EXTENSIONS.has(name.slice(dot));
}

/** JSON bodies larger than this are rejected before parsing. */
export const MAX_JSON_BODY_BYTES = 256 * 1024;