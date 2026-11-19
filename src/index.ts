import { getAssistantCapabilities } from "./assistant/registry";
import { handleAssistantChat } from "./assistant/runtime";
import { providerPoolStatus } from "./assistant/providers";
export interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  ALLOWED_ORIGINS?: string;
  APP_ENV?: string;
  OWNER_EMAIL?: string;
  AI_PROVIDER_POOL?: string;
  AI_API_BASE_URL?: string;
  AI_API_KEY?: string;
  AI_MODEL?: string;
  NVIDIA_NIM_API_KEY?: string;
  NVIDIA_NIM_MODEL?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_AI_TOKEN?: string;
  CLOUDFLARE_AI_MODEL?: string;
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
    headers.set("access-control-allow-methods", "GET, POST, PATCH, DELETE, OPTIONS");
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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


type Resource = "projects" | "tasks";
const RESOURCE_COLUMNS: Record<Resource, string> = {
  projects: "id,name,description,status,created_at,updated_at",
  tasks: "id,project_id,title,description,status,priority,due_at,completed_at,created_at,updated_at",
};
const RESOURCE_FIELDS: Record<Resource, string[]> = {
  projects: ["name", "description", "status"],
  tasks: ["project_id", "title", "description", "status", "priority", "due_at"],
};
const RESOURCE_ENUMS: Record<string, string[]> = {
  status: ["active", "paused", "completed", "archived", "todo", "in_progress", "blocked", "done", "cancelled"],
  priority: ["low", "normal", "high", "urgent"],
};
function validText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
}
function validateResourceBody(resource: Resource, input: JsonRecord, partial: boolean): string | null {
  const allowed = new Set(RESOURCE_FIELDS[resource]);
  for (const key of Object.keys(input)) if (!allowed.has(key)) return `Field "${key}" is not allowed.`;
  if (!partial && resource === "projects" && !validText(input.name, 160)) return "Project name is required (maximum 160 characters).";
  if (!partial && resource === "tasks" && !validText(input.title, 240)) return "Task title is required (maximum 240 characters).";
  if (resource === "projects" && "name" in input && !validText(input.name, 160)) return "Project name must be 1–160 characters.";
  if (resource === "tasks" && "title" in input && !validText(input.title, 240)) return "Task title must be 1–240 characters.";
  for (const key of ["description"]) if (key in input && input[key] !== null && (typeof input[key] !== "string" || (input[key] as string).length > 5000)) return "Description must be text no longer than 5,000 characters.";
  if ("status" in input) {
    const allowedStatuses = resource === "projects" ? ["active", "paused", "completed", "archived"] : ["todo", "in_progress", "blocked", "done", "cancelled"];
    if (typeof input.status !== "string" || !allowedStatuses.includes(input.status)) return "Invalid status value.";
  }
  if (resource === "tasks" && "priority" in input && (typeof input.priority !== "string" || !RESOURCE_ENUMS.priority.includes(input.priority))) return "Invalid task priority.";
  if (resource === "tasks" && "project_id" in input && input.project_id !== null && (typeof input.project_id !== "string" || !/^[0-9a-f-]{36}$/i.test(input.project_id))) return "Project ID must be a valid UUID or null.";
  if (resource === "tasks" && "due_at" in input && input.due_at !== null && (typeof input.due_at !== "string" || !Number.isFinite(Date.parse(input.due_at)))) return "Due date must be a valid date or null.";
  if (partial && Object.keys(input).length === 0) return "At least one editable field is required.";
  return null;
}
async function handleResource(request: Request, env: Env, headers: Headers, resource: Resource): Promise<Response> {
  if (!configured(env)) return json({ error: { code: "DATABASE_NOT_CONFIGURED", message: "GiGo database connection is not configured." } }, 503, headers);
  const token = bearerToken(request);
  if (!token) return json({ error: { code: "UNAUTHENTICATED", message: "Sign in to access your workspace data." } }, 401, headers);
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const method = request.method;
  if (!["GET", "POST", "PATCH", "DELETE"].includes(method)) return json({ error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } }, 405, headers);
  if ((method === "PATCH" || method === "DELETE") && (!id || !/^[0-9a-f-]{36}$/i.test(id))) return json({ error: { code: "INVALID_ID", message: "A valid record ID is required." } }, 400, headers);
  let ownerId: string | null = null;
  if (method === "POST") {
    try {
      const identity = await fetch(new URL("/auth/v1/user", env.SUPABASE_URL!), { headers: { apikey: env.SUPABASE_ANON_KEY!, authorization: `Bearer ${token}` } });
      if (!identity.ok) return json({ error: { code: "INVALID_SESSION", message: "Your session has expired. Sign in again." } }, 401, headers);
      const user = await identity.json() as JsonRecord;
      ownerId = typeof user.id === "string" ? user.id : null;
      if (!ownerId) return json({ error: { code: "INVALID_SESSION", message: "Your account could not be verified." } }, 401, headers);
    } catch { return json({ error: { code: "AUTH_PROVIDER_UNAVAILABLE", message: "Could not verify your account." } }, 502, headers); }
  }
  let endpoint = `/rest/v1/${resource}?select=${RESOURCE_COLUMNS[resource]}`;
  const requestHeaders: Record<string, string> = {
    apikey: env.SUPABASE_ANON_KEY!,
    authorization: `Bearer ${token}`,
    accept: "application/json",
  };
  let body: JsonRecord | undefined;
  if (method === "GET") {
    endpoint += "&order=updated_at.desc&limit=100";
    if (resource === "tasks") endpoint = endpoint.replace("order=updated_at.desc", "order=created_at.desc");
  } else if (method === "POST" || method === "PATCH") {
    const input = await readJson(request);
    if (!input) return json({ error: { code: "INVALID_BODY", message: "A valid JSON body is required." } }, 400, headers);
    const issue = validateResourceBody(resource, input, method === "PATCH");
    if (issue) return json({ error: { code: "INVALID_BODY", message: issue } }, 400, headers);
    body = { ...input };
    if (method === "POST") body.user_id = ownerId;
    if (resource === "tasks" && "status" in body) body.completed_at = body.status === "done" ? new Date().toISOString() : null;
    if (method === "PATCH") endpoint += `&id=eq.${encodeURIComponent(id!)}`;
    requestHeaders["content-type"] = "application/json";
    requestHeaders.prefer = "return=representation";
  } else {
    endpoint += `&id=eq.${encodeURIComponent(id!)}`;
    requestHeaders.prefer = "return=representation";
  }
  try {
    const response = await fetch(new URL(endpoint, env.SUPABASE_URL!), {
      method,
      headers: requestHeaders,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const textBody = await response.text();
    const payload = textBody ? JSON.parse(textBody) : null;
    if (!response.ok) {
      const status = response.status === 401 || response.status === 403 ? response.status : response.status === 400 || response.status === 404 ? response.status : 502;
      return json({ error: { code: "DATABASE_REQUEST_FAILED", message: status === 502 ? "The database request could not be completed." : (payload?.message ?? "The request was rejected.") } }, status, headers);
    }
    if ((method === "PATCH" || method === "DELETE") && Array.isArray(payload) && payload.length === 0) return json({ error: { code: "NOT_FOUND", message: "That record was not found in your workspace." } }, 404, headers);
    return json({ data: payload ?? [] }, method === "POST" ? 201 : 200, headers);
  } catch {
    return json({ error: { code: "DATABASE_UNAVAILABLE", message: "The workspace database is temporarily unavailable." } }, 502, headers);
  }
}


type AssistantResource = "assistant_conversations" | "assistant_messages" | "memory_items";
async function verifiedUserId(token: string, env: Env): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch(new URL("/auth/v1/user", env.SUPABASE_URL!), {
      headers: { apikey: env.SUPABASE_ANON_KEY!, authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    // Keep credentials and upstream response bodies out of diagnostics.
    const reason = error instanceof Error ? error.name : "UnknownError";
    throw new Error(`SUPABASE_AUTH_NETWORK:${reason}`);
  }
  if (!response.ok) return null;
  let raw: string;
  try {
    raw = await response.text();
  } catch (error) {
    const reason = error instanceof Error ? error.name : "UnknownError";
    const message = error instanceof Error ? error.message : "";
    // Include only a short, sanitised runtime error hint; never include response data or credentials.
    const hint = message.replace(/https?:\/\/\S+/gi, "[url]").replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]").slice(0, 100);
    throw new Error(`SUPABASE_AUTH_READ:${reason};hint=${hint || "no-message"}`);
  }
  let user: JsonRecord;
  try {
    user = JSON.parse(raw) as JsonRecord;
  } catch {
    throw new Error(`SUPABASE_AUTH_RESPONSE:status=${response.status};content_type=${response.headers.get("content-type") ?? "unknown"};body_length=${raw.length}`);
  }
  return typeof user.id === "string" ? user.id : null;
}
async function handleAssistantResource(request: Request, env: Env, headers: Headers, resource: AssistantResource): Promise<Response> {
  if (!configured(env)) return json({ error: { code: "DATABASE_NOT_CONFIGURED", message: "GiGo database connection is not configured." } }, 503, headers);
  const token = bearerToken(request);
  if (!token) return json({ error: { code: "UNAUTHENTICATED", message: "Sign in to access assistant data." } }, 401, headers);
  const url = new URL(request.url);
  const method = request.method;
  if (!["GET", "POST", "PATCH"].includes(method)) return json({ error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } }, 405, headers);
  let endpoint = "";
  let select = "";
  if (resource === "assistant_conversations") {
    select = "id,title,context,created_at,updated_at";
    endpoint = `/rest/v1/assistant_conversations?select=${select}&order=updated_at.desc&limit=50`;
  } else if (resource === "assistant_messages") {
    select = "id,conversation_id,role,content,metadata,created_at";
    const conversationId = url.searchParams.get("conversation_id");
    if (!conversationId || !/^[0-9a-f-]{36}$/i.test(conversationId)) return json({ error: { code: "CONVERSATION_REQUIRED", message: "A valid conversation_id is required." } }, 400, headers);
    endpoint = `/rest/v1/assistant_messages?select=${select}&conversation_id=eq.${encodeURIComponent(conversationId)}&order=created_at.asc&limit=200`;
  } else {
    select = "id,category,content,source,confidence,is_active,created_at,updated_at";
    endpoint = `/rest/v1/memory_items?select=${select}&order=updated_at.desc&limit=100`;
  }
  const requestHeaders: Record<string,string> = { apikey: env.SUPABASE_ANON_KEY!, authorization: `Bearer ${token}`, accept: "application/json" };
  let body: JsonRecord | undefined;
  if (method === "POST" || method === "PATCH") {
    const input = await readJson(request);
    if (!input) return json({ error: { code: "INVALID_BODY", message: "A valid JSON body is required." } }, 400, headers);
    if (resource === "assistant_conversations") {
      if (method !== "POST" || Object.keys(input).some(k => !["title","context"].includes(k))) return json({ error: { code: "INVALID_BODY", message: "Only title and context can be supplied when creating a conversation." } }, 400, headers);
      if (input.title !== undefined && input.title !== null && (typeof input.title !== "string" || input.title.length > 160)) return json({ error: { code: "INVALID_BODY", message: "Conversation title must be at most 160 characters." } }, 400, headers);
      if (input.context !== undefined && (!input.context || typeof input.context !== "object" || Array.isArray(input.context))) return json({ error: { code: "INVALID_BODY", message: "Conversation context must be an object." } }, 400, headers);
      body = { title: input.title ?? null, context: input.context ?? {} };
    } else if (resource === "assistant_messages") {
      if (method !== "POST" || Object.keys(input).some(k => !["role","content","metadata"].includes(k))) return json({ error: { code: "INVALID_BODY", message: "Only role, content and metadata can be supplied for a message." } }, 400, headers);
      if (!["user","assistant"].includes(String(input.role)) || typeof input.content !== "string" || !input.content.trim() || input.content.length > 20000) return json({ error: { code: "INVALID_BODY", message: "Message role or content is invalid." } }, 400, headers);
      if (input.metadata !== undefined && (!input.metadata || typeof input.metadata !== "object" || Array.isArray(input.metadata))) return json({ error: { code: "INVALID_BODY", message: "Message metadata must be an object." } }, 400, headers);
      body = { conversation_id: url.searchParams.get("conversation_id"), role: input.role, content: input.content, metadata: input.metadata ?? {} };
    } else {
      if (Object.keys(input).some(k => !["category","content","source","confidence","is_active"].includes(k))) return json({ error: { code: "INVALID_BODY", message: "Unsupported memory field." } }, 400, headers);
      if (method === "POST" && (typeof input.content !== "string" || !input.content.trim() || input.content.length > 5000)) return json({ error: { code: "INVALID_BODY", message: "Memory content must be 1–5,000 characters." } }, 400, headers);
      if (method === "PATCH" && (typeof input.is_active !== "boolean" || Object.keys(input).length !== 1)) return json({ error: { code: "INVALID_BODY", message: "Memory updates currently support only is_active." } }, 400, headers);
      if (input.category !== undefined && (typeof input.category !== "string" || input.category.length > 80)) return json({ error: { code: "INVALID_BODY", message: "Memory category must be at most 80 characters." } }, 400, headers);
      if (input.source !== undefined && (typeof input.source !== "string" || input.source.length > 80)) return json({ error: { code: "INVALID_BODY", message: "Memory source must be at most 80 characters." } }, 400, headers);
      body = method === "POST" ? { category: input.category ?? "general", content: input.content, source: input.source ?? "user", confidence: input.confidence ?? 1, is_active: true } : { is_active: input.is_active };
      if (input.confidence !== undefined && (typeof input.confidence !== "number" || input.confidence < 0 || input.confidence > 1)) return json({ error: { code: "INVALID_BODY", message: "Confidence must be between 0 and 1." } }, 400, headers);
      const memoryId = url.searchParams.get("id");
      if (method === "PATCH" && (!memoryId || !/^[0-9a-f-]{36}$/i.test(memoryId))) return json({ error: { code: "INVALID_ID", message: "A valid memory ID is required." } }, 400, headers);
      if (method === "PATCH") endpoint += `&id=eq.${encodeURIComponent(memoryId!)}`;
    }
    if (method === "POST") {
      let userId: string | null = null;
      try { userId = await verifiedUserId(token, env); } catch { return json({ error: { code: "AUTH_PROVIDER_UNAVAILABLE", message: "Could not verify your account." } }, 502, headers); }
      if (!userId) return json({ error: { code: "INVALID_SESSION", message: "Your session has expired. Sign in again." } }, 401, headers);
      body!.user_id = userId;
    }
    requestHeaders["content-type"] = "application/json";
    requestHeaders.prefer = "return=representation";
  }
  try {
    const response = await fetch(new URL(endpoint, env.SUPABASE_URL!), { method, headers: requestHeaders, ...(body ? { body: JSON.stringify(body) } : {}) });
    const raw = await response.text();
    const payload = raw ? JSON.parse(raw) : null;
    if (!response.ok) return json({ error: { code: "DATABASE_REQUEST_FAILED", message: response.status >= 500 ? "The database request could not be completed." : (payload?.message ?? "The request was rejected.") } }, response.status >= 500 ? 502 : response.status, headers);
    if (method === "PATCH" && Array.isArray(payload) && payload.length === 0) return json({ error: { code: "NOT_FOUND", message: "That memory item was not found." } }, 404, headers);
    return json({ data: payload ?? [] }, method === "POST" ? 201 : 200, headers);
  } catch {
    return json({ error: { code: "DATABASE_UNAVAILABLE", message: "Assistant storage is temporarily unavailable." } }, 502, headers);
  }
}


async function handleCapabilities(request: Request, env: Env, headers: Headers): Promise<Response> {
  const token = bearerToken(request);
  if (!token) return json({ error: { code: "UNAUTHENTICATED", message: "Sign in to view GiGo assistant capabilities." } }, 401, headers);
  if (!configured(env)) return json({ error: { code: "AUTH_NOT_CONFIGURED", message: "Authentication is not configured." } }, 503, headers);
  try {
    const userId = await verifiedUserId(token, env);
    if (!userId) return json({ error: { code: "INVALID_SESSION", message: "Your session has expired. Sign in again." } }, 401, headers);
    return json({ data: getAssistantCapabilities() }, 200, headers);
  } catch {
    return json({ error: { code: "AUTH_PROVIDER_UNAVAILABLE", message: "Could not verify your account." } }, 502, headers);
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
    const resourceRoutes: Record<string, Resource> = {
      "/api/v1/projects": "projects",
      "/api/v1/tasks": "tasks",
    };
    const resource = resourceRoutes[url.pathname];
    if (resource) return handleResource(request, env, headers, resource);

    const assistantRoutes: Record<string, AssistantResource> = {
      "/api/v1/conversations": "assistant_conversations",
      "/api/v1/messages": "assistant_messages",
      "/api/v1/memory": "memory_items",
    };
    const assistantResource = assistantRoutes[url.pathname];
    if (assistantResource) return handleAssistantResource(request, env, headers, assistantResource);

    if (request.method === "GET" && url.pathname === "/api/v1/assistant/capabilities") return handleCapabilities(request, env, headers);

    if (request.method === "GET" && url.pathname === "/api/v1/assistant/providers") {
      // This endpoint exposes configuration metadata only (provider names, model IDs,
      // key counts and non-secret key IDs). It never returns API keys or tokens.
      // Avoid coupling this read-only status view to Supabase Auth availability.
      const token = bearerToken(request);
      if (!token) return json({ error: { code: "UNAUTHENTICATED", message: "Sign in to view AI provider status." } }, 401, headers);
      try {
        return json({ data: providerPoolStatus(env) }, 200, headers);
      } catch (error) {
        // Provider pool errors are configuration diagnostics only; never return secret values.
        const message = error instanceof Error ? error.message : "Unknown provider configuration error.";
        return json({ error: { code: "PROVIDER_CONFIGURATION_INVALID", message } }, 500, headers);
      }
    }

    if (request.method === "POST" && url.pathname === "/api/v1/assistant/chat") {
      const token = bearerToken(request);
      if (!token) return json({ error: { code: "UNAUTHENTICATED", message: "Sign in to chat with GiGo." } }, 401, headers);
      if (!configured(env)) return json({ error: { code: "DATABASE_NOT_CONFIGURED", message: "GiGo storage is not configured." } }, 503, headers);
      try {
        const userId = await verifiedUserId(token, env);
        if (!userId) return json({ error: { code: "INVALID_SESSION", message: "Your session has expired. Sign in again." } }, 401, headers);
        const result = await handleAssistantChat(request, env, token);
        const responseHeaders = new Headers(result.headers);
        headers.forEach((value, key) => responseHeaders.set(key, value));
        return new Response(result.body, { status: result.status, headers: responseHeaders });
      } catch {
        return json({ error: { code: "AUTH_PROVIDER_UNAVAILABLE", message: "Could not verify your account." } }, 502, headers);
      }
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

    // Serve dedicated public landing, login, and overview routes.
    if (env.ASSETS) {
      const pageRoutes = new Set(["/login", "/overview", "/assistant", "/projects", "/tasks", "/research", "/products", "/partners", "/leads", "/offers", "/marketing", "/outreach", "/launch", "/commerce", "/creative", "/customers", "/analytics", "/learning", "/settings"]);
      if (request.method === "GET" && pageRoutes.has(url.pathname)) {
        const assetUrl = new URL(request.url);
        assetUrl.pathname = url.pathname + ".html";
        return env.ASSETS.fetch(new Request(assetUrl.toString(), request));
      }
      return env.ASSETS.fetch(request);
    }
    return json({ error: { code: "NOT_FOUND", message: "The requested endpoint does not exist." } }, 404, headers);
  },
};
