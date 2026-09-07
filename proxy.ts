import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { createRateLimiter, clientIp } from "@/lib/rate-limit";
import { MAX_JSON_BODY_BYTES } from "@/lib/security";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

function securityHeaders(): Record<string, string> {
  const dev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "connect-src 'self' blob: https://*.supabase.co wss://*.supabase.co https://*.supabase.in wss://*.supabase.in https://*.upstash.io https://*.r2.cloudflarestorage.com https://*.r2.dev",
    "worker-src 'self' blob:",
    "media-src 'self' blob: https:",
  ].join("; ");

  const headers: Record<string, string> = {
    "Content-Security-Policy": csp,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };

  if (!dev) {
    headers["Strict-Transport-Security"] =
      "max-age=63072000; includeSubDomains";
  }

  return headers;
}

function applyHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(securityHeaders())) {
    response.headers.set(key, value);
  }
  return response;
}

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return (
    origin === request.nextUrl.origin ||
    (typeof APP_URL === "string" && origin === APP_URL)
  );
}

// Mutating endpoints are rate-limited and CSRF-checked. Matching is done on the
// pathname so rate limiting stays cheap (no DB/auth call).
const RATE_LIMITED_PATHS: Array<{
  match: (p: string) => boolean;
  limit: number;
  windowSeconds: number;
  prefix: string;
}> = [
  {
    match: (p) => p.startsWith("/api/auth/callback"),
    limit: 30,
    windowSeconds: 60,
    prefix: "rl:auth:callback",
  },
  {
    match: (p) => p.startsWith("/api/auth/logout"),
    limit: 30,
    windowSeconds: 60,
    prefix: "rl:auth:logout",
  },
  {
    match: (p) => p.startsWith("/api/upload/presign"),
    limit: 20,
    windowSeconds: 60,
    prefix: "rl:upload:presign",
  },
  {
    match: (p) => p.startsWith("/api/attachments"),
    limit: 30,
    windowSeconds: 60,
    prefix: "rl:attachments",
  },
  {
    match: (p) => p.startsWith("/api/workspaces"),
    limit: 40,
    windowSeconds: 60,
    prefix: "rl:workspaces",
  },
  {
    match: (p) => p.startsWith("/api/admin/assignments"),
    limit: 30,
    windowSeconds: 60,
    prefix: "rl:assignments",
  },
  {
    match: (p) => p.startsWith("/api/inngest"),
    limit: 30,
    windowSeconds: 60,
    prefix: "rl:inngest",
  },
  {
    match: (p) => p.startsWith("/api"),
    limit: 120,
    windowSeconds: 60,
    prefix: "rl:api",
  },
];

const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export async function proxy(request: NextRequest) {
  const isApiRoute = request.nextUrl.pathname.startsWith("/api");
  const isMutating = MUTATING_METHODS.has(request.method);

  // ---- CSRF: reject cross-site state-changing API calls -------------------
  if (isApiRoute && isMutating && !isSameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ---- JSON body size cap --------------------------------------------------
  if (isApiRoute && isMutating) {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const length = Number(request.headers.get("content-length") ?? 0);
      if (length > MAX_JSON_BODY_BYTES) {
        return NextResponse.json(
          { error: "Request body too large" },
          { status: 413 }
        );
      }
    }
  }

  // ---- Rate limiting --------------------------------------------------------
  if (isApiRoute) {
    const path = request.nextUrl.pathname;
    for (const rl of RATE_LIMITED_PATHS) {
      if (rl.match(path)) {
        const limiter = createRateLimiter(rl);
        const result = await limiter.check(clientIp(request));
        if (!result.success) {
          return applyHeaders(
            NextResponse.json(
              { error: "Too many requests, please slow down." },
              { status: 429, headers: { "Retry-After": String(Math.ceil(result.reset / 1000)) } }
            )
          );
        }
        break;
      }
    }
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/register");
  const isDashboardRoute =
    request.nextUrl.pathname === "/" ||
    request.nextUrl.pathname.startsWith("/settings") ||
    request.nextUrl.pathname.startsWith("/projects") ||
    request.nextUrl.pathname.startsWith("/side-projects") ||
    request.nextUrl.pathname.startsWith("/docs") ||
    request.nextUrl.pathname.startsWith("/meetings") ||
    request.nextUrl.pathname.startsWith("/hosting") ||
    request.nextUrl.pathname.startsWith("/wiki") ||
    request.nextUrl.pathname.startsWith("/team");

  if (!user && isDashboardRoute && !isApiRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return applyHeaders(NextResponse.redirect(url));
  }

  if (user && isAuthRoute && !isApiRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return applyHeaders(NextResponse.redirect(url));
  }

  return applyHeaders(supabaseResponse);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};