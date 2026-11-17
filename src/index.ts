export interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  ALLOWED_ORIGINS?: string;
  APP_ENV?: string;
}

type JsonRecord = Record<string, unknown>;

function json(data: JsonRecord, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });
}

function allowedOrigin(origin: string | null, env: Env): string | null {
  if (!origin) return null;
  const allowed = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return allowed.includes(origin) ? origin : null;
}

function corsHeaders(origin: string | null, env: Env): Headers {
  const headers = new Headers();
  const accepted = allowedOrigin(origin, env);
  if (accepted) {
    headers.set("access-control-allow-origin", accepted);
    headers.set("vary", "Origin");
    headers.set("access-control-allow-methods", "GET, OPTIONS");
    headers.set("access-control-allow-headers", "Authorization, Content-Type");
    headers.set("access-control-max-age", "86400");
  }
  return headers;
}

function bearerToken(request: Request): string | null {
  const value = request.headers.get("authorization");
  if (!value) return null;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

async function handleMe(request: Request, env: Env, headers: Headers): Promise<Response> {
  const token = bearerToken(request);
  if (!token) {
    return json({ error: { code: "UNAUTHENTICATED", message: "A valid bearer token is required." } }, 401, headers);
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return json({ error: { code: "SERVICE_NOT_CONFIGURED", message: "Authentication service is not configured yet." } }, 503, headers);
  }

  try {
    const response = await fetch(new URL("/auth/v1/user", env.SUPABASE_URL), {
      method: "GET",
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      return json({ error: { code: "INVALID_SESSION", message: "The session is invalid or expired." } }, 401, headers);
    }

    const user = await response.json() as JsonRecord;
    return json({
      data: {
        id: user.id ?? null,
        email: user.email ?? null,
        authenticated: true,
      },
    }, 200, headers);
  } catch {
    return json({ error: { code: "AUTH_PROVIDER_UNAVAILABLE", message: "Could not verify the session. Try again shortly." } }, 502, headers);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("origin");
    const headers = corsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      if (origin && !allowedOrigin(origin, env)) {
        return json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "This origin is not allowed." } }, 403);
      }
      return new Response(null, { status: 204, headers });
    }

    if (origin && !allowedOrigin(origin, env)) {
      return json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "This origin is not allowed." } }, 403);
    }

    if (request.method === "GET" && (url.pathname === "/healthz" || url.pathname === "/api/v1/status")) {
      return json({
        data: {
          service: "gigo-api",
          status: "ok",
          environment: env.APP_ENV ?? "unknown",
          version: "0.1.0",
        },
      }, 200, headers);
    }

    if (request.method === "GET" && url.pathname === "/api/v1/me") {
      return handleMe(request, env, headers);
    }

    return json({ error: { code: "NOT_FOUND", message: "The requested endpoint does not exist." } }, 404, headers);
  },
};
