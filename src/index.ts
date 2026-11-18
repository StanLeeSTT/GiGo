export interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  ALLOWED_ORIGINS?: string;
  APP_ENV?: string;
  OWNER_EMAIL?: string;
  ASSETS?: Fetcher;
}

type JsonRecord = Record<string, unknown>;

function json(data: JsonRecord, status = 200, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "application/json; charset=utf-8");
  responseHeaders.set("cache-control", "no-store");
  responseHeaders.set("x-content-type-options", "nosniff");
  return new Response(JSON.stringify(data), { status, headers: responseHeaders });
}

function allowedOrigin(origin: string | null, env: Env): string | null {
  if (!origin) return null;
  const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((v) => v.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : null;
}

function corsHeaders(origin: string | null, env: Env): Headers {
  const headers = new Headers();
  const accepted = allowedOrigin(origin, env);
  if (accepted) {
    headers.set("access-control-allow-origin", accepted);
    headers.set("vary", "Origin");
    headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
    headers.set("access-control-allow-headers", "Authorization, Content-Type");
    headers.set("access-control-max-age", "86400");
  }
  return headers;
}

function bearerToken(request: Request): string | null {
  const value = request.headers.get("authorization");
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function configured(env: Env): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);
}

async function readJson(request: Request): Promise<JsonRecord | null> {
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as JsonRecord;
  } catch {
    return null;
  }
}

function authErrorMessage(payload: JsonRecord, fallback: string): string {
  const message = payload.msg ?? payload.message ?? payload.error_description ?? payload.error;
  return typeof message === "string" ? message.slice(0, 300) : fallback;
}

async function authRequest(path: string, env: Env, body: JsonRecord): Promise<Response> {
  return fetch(new URL(path, env.SUPABASE_URL!), {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_ANON_KEY!,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function handleAuth(request: Request, env: Env, headers: Headers, action: "signup" | "login" | "refresh" | "logout" | "resend"): Promise<Response> {
  if (!configured(env)) {
    return json({ error: { code: "AUTH_NOT_CONFIGURED", message: "GiGo authentication is not connected yet. Configure the Supabase project URL and anon key first." } }, 503, headers);
  }

  if (action === "logout") {
    const token = bearerToken(request);
    if (!token) return json({ error: { code: "UNAUTHENTICATED", message: "No active session was supplied." } }, 401, headers);
    try {
      const response = await fetch(new URL("/auth/v1/logout", env.SUPABASE_URL!), {
        method: "POST",
        headers: { apikey: env.SUPABASE_ANON_KEY!, authorization: `Bearer ${token}` },
      });
      if (!response.ok) return json({ error: { code: "LOGOUT_FAILED", message: "The session could not be closed by the authentication provider." } }, 502, headers);
      return json({ data: { signed_out: true } }, 200, headers);
    } catch {
      return json({ error: { code: "AUTH_PROVIDER_UNAVAILABLE", message: "Authentication provider is unavailable." } }, 502, headers);
    }
  }

  const input = await readJson(request);
  if (!input) return json({ error: { code: "INVALID_BODY", message: "A valid JSON body is required." } }, 400, headers);

  let path = "";
  let body: JsonRecord = {};
  if (action === "resend") {
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
      return json({ error: { code: "INVALID_EMAIL", message: "Enter a valid email address." } }, 400, headers);
    }
    path = `/auth/v1/resend?redirect_to=${encodeURIComponent(new URL("/login", request.url).toString())}`;
    body = { email, type: "signup" };
  } else if (action === "signup" || action === "login") {
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    const password = typeof input.password === "string" ? input.password : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: { code: "INVALID_EMAIL", message: "Enter a valid email address." } }, 400, headers);
    }
    if (password.length < 8 || password.length > 128) {
      return json({ error: { code: "INVALID_PASSWORD", message: "Password must be between 8 and 128 characters." } }, 400, headers);
    }
    if (action === "signup") {
      const ownerEmail = env.OWNER_EMAIL?.trim().toLowerCase();
      if (!ownerEmail) return json({ error: { code: "OWNER_NOT_CONFIGURED", message: "Owner-only account creation is not configured yet. Set OWNER_EMAIL on the Worker before creating the owner account." } }, 503, headers);
      if (email !== ownerEmail) return json({ error: { code: "SIGNUP_NOT_ALLOWED", message: "GiGo is a private owner workspace. This email is not authorised to create its account." } }, 403, headers);
    }
    path = action === "signup" ? `/auth/v1/signup?redirect_to=${encodeURIComponent(new URL("/login", request.url).toString())}` : "/auth/v1/token?grant_type=password";
    body = { email, password };
  } else {
    const refreshToken = typeof input.refresh_token === "string" ? input.refresh_token : "";
    if (!refreshToken) return json({ error: { code: "INVALID_REFRESH_TOKEN", message: "A refresh token is required." } }, 400, headers);
    path = "/auth/v1/token?grant_type=refresh_token";
    body = { refresh_token: refreshToken };
  }

  try {
    const response = await authRequest(path, env, body);
    const payload = await response.json().catch(() => ({})) as JsonRecord;
    if (!response.ok) {
      const status = response.status === 400 || response.status === 422 ? 400 : response.status === 429 ? 429 : 502;
      return json({ error: { code: "AUTH_REQUEST_FAILED", message: authErrorMessage(payload, "The authentication request could not be completed.") } }, status, headers);
    }
    return json({ data: payload }, 200, headers);
  } catch {
    return json({ error: { code: "AUTH_PROVIDER_UNAVAILABLE", message: "Authentication provider is unavailable. Try again shortly." } }, 502, headers);
  }
}

async function handleMe(request: Request, env: Env, headers: Headers): Promise<Response> {
  const token = bearerToken(request);
  if (!token) return json({ error: { code: "UNAUTHENTICATED", message: "A valid bearer token is required." } }, 401, headers);
  if (!configured(env)) return json({ error: { code: "AUTH_NOT_CONFIGURED", message: "Authentication is not configured." } }, 503, headers);

  try {
    const response = await fetch(new URL("/auth/v1/user", env.SUPABASE_URL!), {
      method: "GET",
      headers: { apikey: env.SUPABASE_ANON_KEY!, authorization: `Bearer ${token}` },
    });
    if (!response.ok) return json({ error: { code: "INVALID_SESSION", message: "The session is invalid or expired." } }, 401, headers);
    const user = await response.json() as JsonRecord;
    return json({ data: { id: user.id ?? null, email: user.email ?? null, authenticated: true } }, 200, headers);
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
      if (origin && !allowedOrigin(origin, env)) return json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "This origin is not allowed." } }, 403);
      return new Response(null, { status: 204, headers });
    }
    if (origin && !allowedOrigin(origin, env)) return json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "This origin is not allowed." } }, 403);

    if (request.method === "GET" && (url.pathname === "/healthz" || url.pathname === "/api/v1/status")) {
      return json({ data: { service: "gigo-api", status: "ok", environment: env.APP_ENV ?? "unknown", version: "0.2.0", auth_configured: configured(env) } }, 200, headers);
    }
    if (request.method === "GET" && url.pathname === "/api/v1/me") return handleMe(request, env, headers);

    const authRoutes: Record<string, "signup" | "login" | "refresh" | "logout" | "resend"> = {
      "/api/v1/auth/signup": "signup",
      "/api/v1/auth/login": "login",
      "/api/v1/auth/refresh": "refresh",
      "/api/v1/auth/logout": "logout",
      "/api/v1/auth/resend": "resend",
    };
    const authAction = authRoutes[url.pathname];
    if (request.method === "POST" && authAction) return handleAuth(request, env, headers, authAction);

    if (env.ASSETS) {\n      if (request.method === "GET" && (url.pathname === "/login" || url.pathname === "/overview")) {\n        const assetUrl = new URL(request.url);\n        assetUrl.pathname = url.pathname + ".html";\n        return env.ASSETS.fetch(new Request(assetUrl.toString(), request));\n      }\n      return env.ASSETS.fetch(request);\n    }
    return json({ error: { code: "NOT_FOUND", message: "The requested endpoint does not exist." } }, 404, headers);
  },
};
