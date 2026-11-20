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



type ResearchResource = "research_runs" | "research_sources" | "research_opportunities";
const RESEARCH_FIELDS: Record<ResearchResource, string[]> = {
  research_runs: ["title","research_question","market_scope","status","summary","findings","methodology","completed_at"],
  research_sources: ["research_run_id","source_type","title","url","publisher","published_at","excerpt","relevance_score","evidence_status","metadata"],
  research_opportunities: ["research_run_id","title","customer_problem","target_customer","proposed_solution","revenue_model","validation_score","risks","validation_steps","status"]
};
const RESEARCH_COLUMNS: Record<ResearchResource, string> = {
  research_runs: "id,title,research_question,market_scope,status,summary,findings,methodology,created_at,updated_at,completed_at",
  research_sources: "id,research_run_id,source_type,title,url,publisher,published_at,retrieved_at,excerpt,relevance_score,evidence_status,metadata,created_at",
  research_opportunities: "id,research_run_id,title,customer_problem,target_customer,proposed_solution,revenue_model,validation_score,risks,validation_steps,status,created_at,updated_at"
};
async function handleResearchResource(request: Request, env: Env, headers: Headers, resource: ResearchResource): Promise<Response> {
  if (!configured(env)) return json({ error: { code: "DATABASE_NOT_CONFIGURED", message: "GiGo database connection is not configured." } }, 503, headers);
  const token = bearerToken(request);
  if (!token) return json({ error: { code: "UNAUTHENTICATED", message: "Sign in to access research." } }, 401, headers);
  const method = request.method;
  if (!["GET","POST","PATCH"].includes(method)) return json({ error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } }, 405, headers);
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const runId = url.searchParams.get("research_run_id");
  if ((method === "PATCH" && (!id || !/^[0-9a-f-]{36}$/i.test(id))) || (runId && !/^[0-9a-f-]{36}$/i.test(runId))) return json({ error: { code: "INVALID_ID", message: "A valid record ID is required." } }, 400, headers);
  let ownerId: string | null = null;
  if (method === "POST") {
    try { ownerId = await verifiedUserId(token, env); }
    catch { return json({ error: { code: "AUTH_PROVIDER_UNAVAILABLE", message: "Could not verify your account." } }, 502, headers); }
    if (!ownerId) return json({ error: { code: "INVALID_SESSION", message: "Your session has expired. Sign in again." } }, 401, headers);
  }
  const fields = RESEARCH_FIELDS[resource];
  let endpoint = "/rest/v1/" + resource + "?select=" + RESEARCH_COLUMNS[resource];
  const params = new URLSearchParams({ order: resource === "research_sources" ? "created_at.desc" : "updated_at.desc", limit: "100" });
  if (resource !== "research_runs" && runId) params.set("research_run_id", "eq." + runId);
  if (method === "GET") endpoint += "&" + params.toString();
  let body: JsonRecord | undefined;
  if (method === "POST" || method === "PATCH") {
    const input = await readJson(request);
    if (!input) return json({ error: { code: "INVALID_BODY", message: "A valid JSON body is required." } }, 400, headers);
    for (const key of Object.keys(input)) if (!fields.includes(key)) return json({ error: { code: "INVALID_BODY", message: "Unsupported research field: " + key } }, 400, headers);
    const required = resource === "research_runs" ? ["title","research_question"] : resource === "research_sources" ? ["research_run_id","title","url"] : ["research_run_id","title","customer_problem"];
    if (method === "POST" && required.some(key => !validText(input[key], key === "research_question" ? 5000 : key === "url" ? 2048 : key === "customer_problem" ? 5000 : 500))) return json({ error: { code: "INVALID_BODY", message: "Required research fields are missing or invalid." } }, 400, headers);
    if (method === "PATCH" && Object.keys(input).length === 0) return json({ error: { code: "INVALID_BODY", message: "At least one field is required." } }, 400, headers);
    if (resource === "research_runs" && input.status !== undefined && !["draft","queued","running","completed","failed","cancelled"].includes(String(input.status))) return json({ error: { code: "INVALID_STATUS", message: "Invalid research status." } }, 400, headers);
    if (resource === "research_sources" && input.evidence_status !== undefined && !["unreviewed","supports","contradicts","context","rejected"].includes(String(input.evidence_status))) return json({ error: { code: "INVALID_STATUS", message: "Invalid evidence status." } }, 400, headers);
    if (resource === "research_opportunities" && input.status !== undefined && !["discovered","investigating","validated","rejected","pursuing"].includes(String(input.status))) return json({ error: { code: "INVALID_STATUS", message: "Invalid opportunity status." } }, 400, headers);
    if (resource !== "research_runs" && input.research_run_id !== undefined && !/^[0-9a-f-]{36}$/i.test(String(input.research_run_id))) return json({ error: { code: "INVALID_ID", message: "A valid research_run_id is required." } }, 400, headers);
    body = { ...input };
    if (method === "POST") body.user_id = ownerId;
    if (method === "PATCH") endpoint += "&id=eq." + encodeURIComponent(id!);
    if (method === "POST" && resource === "research_runs" && body.status === undefined) body.status = "draft";
  }
  try {
    const response = await fetch(new URL(endpoint, env.SUPABASE_URL!), {
      method, headers: { apikey: env.SUPABASE_ANON_KEY!, authorization: "Bearer " + token, accept: "application/json", ...(body ? { "content-type": "application/json", prefer: "return=representation" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const raw = await response.text();
    const payload = raw ? JSON.parse(raw) : null;
    if (!response.ok) return json({ error: { code: "RESEARCH_STORAGE_FAILED", message: response.status >= 500 ? "Research storage could not complete the request. Confirm migration 0005 has been applied." : (payload?.message ?? "The research request was rejected.") } }, response.status >= 500 ? 502 : response.status, headers);
    if (method === "PATCH" && Array.isArray(payload) && payload.length === 0) return json({ error: { code: "NOT_FOUND", message: "Research record not found." } }, 404, headers);
    return json({ data: payload ?? [] }, method === "POST" ? 201 : 200, headers);
  } catch { return json({ error: { code: "DATABASE_UNAVAILABLE", message: "Research storage is temporarily unavailable." } }, 502, headers); }
}


type BusinessResource = "products" | "partner_candidates" | "leads" | "offers";
const BUSINESS_FIELDS: Record<BusinessResource, string[]> = {
  products: ["research_run_id","name","summary","target_customer","customer_problem","proposed_solution","product_type","outline","price_amount","price_currency","status","validation_notes"],
  partner_candidates: ["name","platform","profile_url","niche","follower_count","average_views","business_email","has_competing_offer","score_components","total_score","recommendation","evidence","due_diligence","status"],
  leads: ["name","organisation","email","website","source","source_url","customer_problem","fit_score","stage","do_not_contact","notes","last_contacted_at"],
  offers: ["product_id","name","target_customer","promised_outcome","deliverables","exclusions","price_amount","price_currency","delivery_cost","payment_fee_percent","partner_share_percent","status","assumptions"]
};
const BUSINESS_COLUMNS: Record<BusinessResource, string> = {
  products: "id,research_run_id,name,summary,target_customer,customer_problem,proposed_solution,product_type,outline,price_amount,price_currency,status,validation_notes,created_at,updated_at",
  partner_candidates: "id,name,platform,profile_url,niche,follower_count,average_views,business_email,has_competing_offer,score_components,total_score,recommendation,evidence,due_diligence,status,created_at,updated_at",
  leads: "id,name,organisation,email,website,source,source_url,customer_problem,fit_score,stage,do_not_contact,notes,last_contacted_at,created_at,updated_at",
  offers: "id,product_id,name,target_customer,promised_outcome,deliverables,exclusions,price_amount,price_currency,delivery_cost,payment_fee_percent,partner_share_percent,status,assumptions,created_at,updated_at"
};
async function handleBusinessResource(request: Request, env: Env, headers: Headers, resource: BusinessResource): Promise<Response> {
  if (!configured(env)) return json({ error: { code: "DATABASE_NOT_CONFIGURED", message: "GiGo database connection is not configured." } }, 503, headers);
  const token = bearerToken(request);
  if (!token) return json({ error: { code: "UNAUTHENTICATED", message: "Sign in to access this workspace." } }, 401, headers);
  const method = request.method;
  if (!["GET","POST","PATCH"].includes(method)) return json({ error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } }, 405, headers);
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (method === "PATCH" && (!id || !/^[0-9a-f-]{36}$/i.test(id))) return json({ error: { code: "INVALID_ID", message: "A valid record ID is required." } }, 400, headers);
  let ownerId: string | null = null;
  if (method === "POST") {
    try { ownerId = await verifiedUserId(token, env); }
    catch { return json({ error: { code: "AUTH_PROVIDER_UNAVAILABLE", message: "Could not verify your account." } }, 502, headers); }
    if (!ownerId) return json({ error: { code: "INVALID_SESSION", message: "Your session has expired. Sign in again." } }, 401, headers);
  }
  let endpoint = "/rest/v1/" + resource + "?select=" + BUSINESS_COLUMNS[resource];
  let body: JsonRecord | undefined;
  if (method === "GET") {
    endpoint += "&order=updated_at.desc&limit=100";
    const status = url.searchParams.get("status");
    if (status) endpoint += "&status=eq." + encodeURIComponent(status);
  }
  if (method === "POST" || method === "PATCH") {
    const input = await readJson(request);
    if (!input) return json({ error: { code: "INVALID_BODY", message: "A valid JSON body is required." } }, 400, headers);
    for (const key of Object.keys(input)) if (!BUSINESS_FIELDS[resource].includes(key)) return json({ error: { code: "INVALID_BODY", message: "Unsupported field: " + key } }, 400, headers);
    if (resource === "products") {
      if (method === "POST" && !validText(input.name, 200)) return json({ error: { code: "INVALID_BODY", message: "A product name of 1–200 characters is required." } }, 400, headers);
      if (input.product_type !== undefined && !["ebook","course","workbook","template","membership","software","service","other"].includes(String(input.product_type))) return json({ error: { code: "INVALID_PRODUCT_TYPE", message: "Invalid product type." } }, 400, headers);
      if (input.status !== undefined && !["draft","validating","building","ready","launched","archived"].includes(String(input.status))) return json({ error: { code: "INVALID_STATUS", message: "Invalid product status." } }, 400, headers);
      if (input.price_amount !== undefined && input.price_amount !== null && (typeof input.price_amount !== "number" || !Number.isFinite(input.price_amount) || input.price_amount < 0)) return json({ error: { code: "INVALID_PRICE", message: "Price must be a non-negative number." } }, 400, headers);
      if (input.research_run_id !== undefined && input.research_run_id !== null && !/^[0-9a-f-]{36}$/i.test(String(input.research_run_id))) return json({ error: { code: "INVALID_ID", message: "A valid research brief ID is required." } }, 400, headers);
    } else if (resource === "partner_candidates") {
      if (method === "POST" && (!validText(input.name, 200) || !validText(input.platform, 80) || !validText(input.profile_url, 2048))) return json({ error: { code: "INVALID_BODY", message: "Candidate name, platform and profile URL are required." } }, 400, headers);
      if (input.profile_url !== undefined) {
        try { const parsed = new URL(String(input.profile_url)); if (!["http:","https:"].includes(parsed.protocol)) throw new Error(); }
        catch { return json({ error: { code: "INVALID_URL", message: "Profile URL must be a valid HTTP or HTTPS URL." } }, 400, headers); }
      }
      if (input.recommendation !== undefined && !["shortlist","investigate","not_recommend","hard_stop"].includes(String(input.recommendation))) return json({ error: { code: "INVALID_RECOMMENDATION", message: "Invalid partner recommendation." } }, 400, headers);
      if (input.status !== undefined && !["new","reviewing","shortlisted","contacted","negotiating","partnered","rejected"].includes(String(input.status))) return json({ error: { code: "INVALID_STATUS", message: "Invalid partner status." } }, 400, headers);
      if (input.total_score !== undefined && input.total_score !== null && (typeof input.total_score !== "number" || input.total_score < 0 || input.total_score > 100)) return json({ error: { code: "INVALID_SCORE", message: "Partner score must be between 0 and 100." } }, 400, headers);
    } else if (resource === "leads") {
      if (method === "POST" && !validText(input.name, 200)) return json({ error: { code: "INVALID_BODY", message: "Lead name is required." } }, 400, headers);
      if (input.stage !== undefined && !["new","qualified","contacted","proposal","won","lost","do_not_contact"].includes(String(input.stage))) return json({ error: { code: "INVALID_STAGE", message: "Invalid lead stage." } }, 400, headers);
      if (input.fit_score !== undefined && input.fit_score !== null && (typeof input.fit_score !== "number" || input.fit_score < 0 || input.fit_score > 100)) return json({ error: { code: "INVALID_SCORE", message: "Lead fit score must be between 0 and 100." } }, 400, headers);
      if (input.do_not_contact !== undefined && typeof input.do_not_contact !== "boolean") return json({ error: { code: "INVALID_CONSENT", message: "do_not_contact must be true or false." } }, 400, headers);
    } else if (resource === "offers") {
      if (method === "POST" && !validText(input.name, 200)) return json({ error: { code: "INVALID_BODY", message: "Offer name is required." } }, 400, headers);
      if (input.status !== undefined && !["draft","validating","ready","active","archived"].includes(String(input.status))) return json({ error: { code: "INVALID_STATUS", message: "Invalid offer status." } }, 400, headers);
      for (const key of ["price_amount","delivery_cost"] as const) if (input[key] !== undefined && input[key] !== null && (typeof input[key] !== "number" || !Number.isFinite(input[key]) || input[key] < 0)) return json({ error: { code: "INVALID_PRICE", message: key + " must be a non-negative number." } }, 400, headers);
      for (const key of ["payment_fee_percent","partner_share_percent"] as const) if (input[key] !== undefined && input[key] !== null && (typeof input[key] !== "number" || input[key] < 0 || input[key] > 100)) return json({ error: { code: "INVALID_PERCENT", message: key + " must be between 0 and 100." } }, 400, headers);
      if (input.product_id !== undefined && input.product_id !== null && !/^[0-9a-f-]{36}$/i.test(String(input.product_id))) return json({ error: { code: "INVALID_ID", message: "A valid product ID is required." } }, 400, headers);
      if (input.price_currency !== undefined && !/^[A-Za-z]{3}$/.test(String(input.price_currency))) return json({ error: { code: "INVALID_CURRENCY", message: "Currency must be a three-letter code." } }, 400, headers);
    }
    if (method === "PATCH" && Object.keys(input).length === 0) return json({ error: { code: "INVALID_BODY", message: "At least one field is required." } }, 400, headers);
    body = { ...input };
    if (resource === "leads" && method === "POST") {
      if (body.do_not_contact === true || body.stage === "do_not_contact") { body.do_not_contact = true; body.stage = "do_not_contact"; }
      else if (body.do_not_contact === undefined) body.do_not_contact = false;
    }
    if (resource === "offers" && method === "POST") {
      const price = typeof body.price_amount === "number" ? body.price_amount : null;
      const deliveryCost = typeof body.delivery_cost === "number" ? body.delivery_cost : 0;
      const paymentFeePercent = typeof body.payment_fee_percent === "number" ? body.payment_fee_percent : 0;
      const partnerSharePercent = typeof body.partner_share_percent === "number" ? body.partner_share_percent : 0;
      if (price === null) body.assumptions = { estimate_available: false, note: "Add a price to calculate indicative economics." };
      else {
        const paymentFee = price * paymentFeePercent / 100;
        const contribution = price - paymentFee - deliveryCost;
        const partnerShare = Math.max(0, contribution) * partnerSharePercent / 100;
        const netBeforeTax = contribution - partnerShare;
        body.assumptions = { estimate_available: true, gross_price: price, payment_fee_estimate: paymentFee, delivery_cost: deliveryCost, partner_share_estimate: partnerShare, net_before_tax_estimate: netBeforeTax, margin_percent_before_tax: price > 0 ? netBeforeTax / price * 100 : null, assumptions: "Indicative only; excludes taxes, refunds, chargebacks, support overhead and other unlisted costs." };
      }
    }
    if (resource === "partner_candidates" && method === "POST") {
      const weights: Record<string, number> = { audience_fit: 20, authenticity_engagement: 20, credibility_reputation: 15, reach_consistency: 10, commercial_potential: 15, brand_values: 10, operational_readiness: 5, legal_rights_readiness: 5 };
      const components = body.score_components && typeof body.score_components === "object" && !Array.isArray(body.score_components) ? body.score_components as JsonRecord : {};
      const keys = Object.keys(weights);
      const complete = keys.every(key => typeof components[key] === "number" && Number.isFinite(components[key]) && Number(components[key]) >= 0 && Number(components[key]) <= weights[key]);
      const diligence = body.due_diligence && typeof body.due_diligence === "object" && !Array.isArray(body.due_diligence) ? body.due_diligence as JsonRecord : {};
      const hardStop = diligence.hard_stop === true;
      body.total_score = complete ? keys.reduce((sum, key) => sum + Number(components[key]), 0) : null;
      body.recommendation = hardStop ? "hard_stop" : !complete ? "investigate" : Number(body.total_score) >= 80 ? "shortlist" : Number(body.total_score) >= 65 ? "investigate" : "not_recommend";
    }
    if (method === "POST") {
      body.user_id = ownerId;
      if (resource === "products" && body.status === undefined) body.status = "draft";
      if (resource === "partner_candidates" && body.status === undefined) body.status = "new";
      if (resource === "leads" && body.stage === undefined) body.stage = "new";
      if (resource === "offers" && body.status === undefined) body.status = "draft";
    }
    if (method === "PATCH") endpoint += "&id=eq." + encodeURIComponent(id!);
  }
  endpoint = "/rest/v1/" + resource + "?" + filters.toString();
  try {
    const upstream = await fetch(new URL(endpoint, env.SUPABASE_URL!), {
      method,
      headers: { apikey: env.SUPABASE_ANON_KEY!, authorization: "Bearer " + token, accept: "application/json", ...(body ? { "content-type": "application/json", prefer: "return=representation" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const raw = await upstream.text();
    const payload = raw ? JSON.parse(raw) : null;
    if (!upstream.ok) return json({ error: { code: "BUSINESS_STORAGE_FAILED", message: upstream.status >= 500 ? "Business workspace storage failed. Confirm the required GiGo business migrations have been applied." : (payload?.message ?? "The request was rejected.") } }, upstream.status >= 500 ? 502 : upstream.status, headers);
    if (method === "PATCH" && Array.isArray(payload) && payload.length === 0) return json({ error: { code: "NOT_FOUND", message: "Record not found in this workspace." } }, 404, headers);
    return json({ data: payload ?? [] }, method === "POST" ? 201 : 200, headers);
  } catch { return json({ error: { code: "DATABASE_UNAVAILABLE", message: "Business workspace storage is temporarily unavailable." } }, 502, headers); }
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
      if (!["user","assistant"].includes(String(input.role)) || typeof input.content !== "string" || !input.content.trim() || input.content.length > 100000) return json({ error: { code: "INVALID_BODY", message: "Message role or content is invalid." } }, 400, headers);
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


async function handleChatGPTHistoryImport(request: Request, env: Env, headers: Headers): Promise<Response> {
  if (!configured(env)) return json({ error: { code: "DATABASE_NOT_CONFIGURED", message: "GiGo storage is not configured." } }, 503, headers);
  if (request.method !== "POST") return json({ error: { code: "METHOD_NOT_ALLOWED", message: "Use POST to import conversation history." } }, 405, headers);
  const token = bearerToken(request);
  if (!token) return json({ error: { code: "UNAUTHENTICATED", message: "Sign in to import your history." } }, 401, headers);
  let input: JsonRecord;
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    input = value as JsonRecord;
  } catch { return json({ error: { code: "INVALID_BODY", message: "A valid JSON import batch is required." } }, 400, headers); }
  const externalId = typeof input.chatgpt_conversation_id === "string" ? input.chatgpt_conversation_id.trim() : "";
  const title = typeof input.title === "string" ? input.title.trim().slice(0, 160) : "Imported ChatGPT conversation";
  const batch = Array.isArray(input.messages) ? input.messages : [];
  if (!externalId || externalId.length > 200 || !batch.length || batch.length > 60) return json({ error: { code: "INVALID_IMPORT_BATCH", message: "Each import batch needs a conversation ID and between 1 and 60 messages." } }, 400, headers);
  let ownerId: string | null;
  try { ownerId = await verifiedUserId(token, env); }
  catch { return json({ error: { code: "AUTH_PROVIDER_UNAVAILABLE", message: "Could not verify your account." } }, 502, headers); }
  if (!ownerId) return json({ error: { code: "INVALID_SESSION", message: "Your session has expired. Sign in again." } }, 401, headers);
  const normalized: JsonRecord[] = [];
  for (const item of batch) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return json({ error: { code: "INVALID_IMPORT_MESSAGE", message: "An imported message has an invalid format." } }, 400, headers);
    const message = item as JsonRecord;
    const id = typeof message.id === "string" ? message.id.slice(0, 200) : "";
    const role = message.role === "user" ? "user" : message.role === "assistant" ? "assistant" : "";
    const content = typeof message.content === "string" ? message.content.trim() : "";
    if (!id || !role || !content || content.length > 20000) return json({ error: { code: "INVALID_IMPORT_MESSAGE", message: "Imported messages must have an ID, user/assistant role and text up to 100,000 characters." } }, 400, headers);
    const createdAt = typeof message.created_at === "string" && Number.isFinite(Date.parse(message.created_at)) ? new Date(message.created_at).toISOString() : undefined;
    normalized.push({ user_id: ownerId, role, content, ...(createdAt ? { created_at: createdAt } : {}), metadata: { source: "chatgpt_import", chatgpt_message_id: id, imported_at: new Date().toISOString() } });
  }
  try {
    const lookup = new URLSearchParams({ select: "id,context", "context->>chatgpt_conversation_id": "eq." + externalId, limit: "1" });
    const conversations = await fetch(new URL("/rest/v1/assistant_conversations?" + lookup.toString(), env.SUPABASE_URL!), { headers: { apikey: env.SUPABASE_ANON_KEY!, authorization: "Bearer " + token, accept: "application/json" } });
    if (!conversations.ok) throw new Error("Conversation lookup failed.");
    const found = await conversations.json() as JsonRecord[];
    let conversationId = typeof found?.[0]?.id === "string" ? found[0].id : "";
    if (!conversationId) {
      const createdAt = typeof input.created_at === "string" && Number.isFinite(Date.parse(input.created_at)) ? new Date(input.created_at).toISOString() : undefined;
      const createResponse = await fetch(new URL("/rest/v1/assistant_conversations?select=id", env.SUPABASE_URL!), {
        method: "POST",
        headers: { apikey: env.SUPABASE_ANON_KEY!, authorization: "Bearer " + token, "content-type": "application/json", prefer: "return=representation" },
        body: JSON.stringify({ user_id: ownerId, title, context: { source: "chatgpt_import", chatgpt_conversation_id: externalId, original_created_at: createdAt ?? null }, ...(createdAt ? { created_at: createdAt } : {}) })
      });
      if (!createResponse.ok) throw new Error("Conversation creation failed.");
      const created = await createResponse.json() as JsonRecord[];
      conversationId = typeof created?.[0]?.id === "string" ? created[0].id : "";
      if (!conversationId) throw new Error("Conversation ID was not returned.");
    }
    const ids = normalized.map(row => String((row.metadata as JsonRecord).chatgpt_message_id));
    const existingParams = new URLSearchParams({ select: "id,metadata", conversation_id: "eq." + conversationId, "metadata->>source": "eq.chatgpt_import", "metadata->>chatgpt_message_id": "in.(" + ids.map(id => id.replace(/[(),]/g, "")).join(",") + ")", limit: "100" });
    const existingResponse = await fetch(new URL("/rest/v1/assistant_messages?" + existingParams.toString(), env.SUPABASE_URL!), { headers: { apikey: env.SUPABASE_ANON_KEY!, authorization: "Bearer " + token, accept: "application/json" } });
    if (!existingResponse.ok) throw new Error("Duplicate check failed.");
    const existing = await existingResponse.json() as JsonRecord[];
    const existingIds = new Set((Array.isArray(existing) ? existing : []).map(row => String((row.metadata as JsonRecord | undefined)?.chatgpt_message_id ?? "")));
    const pending = normalized.filter(row => !existingIds.has(String((row.metadata as JsonRecord).chatgpt_message_id))).map(row => ({ ...row, conversation_id: conversationId }));
    if (pending.length) {
      const insertResponse = await fetch(new URL("/rest/v1/assistant_messages?select=id", env.SUPABASE_URL!), { method: "POST", headers: { apikey: env.SUPABASE_ANON_KEY!, authorization: "Bearer " + token, "content-type": "application/json", prefer: "return=representation" }, body: JSON.stringify(pending) });
      if (!insertResponse.ok) throw new Error("Message batch could not be saved.");
    }
    return json({ data: { conversation_id: conversationId, received: normalized.length, imported: pending.length, skipped_duplicates: normalized.length - pending.length } }, 200, headers);
  } catch {
    return json({ error: { code: "HISTORY_IMPORT_FAILED", message: "This history batch could not be saved. You can safely retry it; duplicate messages are checked before insertion." } }, 502, headers);
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

type OperationsResource = "jobs" | "operation_schedules" | "approval_requests" | "notification_events" | "operation_events";
const OPERATIONS_COLUMNS: Record<OperationsResource, string> = {
  jobs: "id,job_type,status,input,progress,checkpoint,idempotency_key,attempts,last_error,run_after,started_at,finished_at,created_at,updated_at",
  operation_schedules: "id,name,schedule_type,schedule_config,job_type,job_input,is_enabled,next_run_at,last_run_at,created_at,updated_at",
  approval_requests: "id,job_id,action_type,title,summary,action_payload,risk_level,status,requested_channels,decision_note,decided_at,expires_at,created_at,updated_at",
  notification_events: "id,approval_request_id,job_id,channel,event_type,title,body,status,provider,provider_reference,attempt_count,scheduled_for,sent_at,delivered_at,last_error,metadata,created_at,updated_at",
  operation_events: "id,job_id,approval_request_id,event_type,severity,title,detail,data,created_at"
};

async function handleOperationsResource(request: Request, env: Env, headers: Headers, resource: OperationsResource): Promise<Response> {
  if (!configured(env)) return json({ error: { code: "DATABASE_NOT_CONFIGURED", message: "GiGo database connection is not configured." } }, 503, headers);
  const token = bearerToken(request);
  if (!token) return json({ error: { code: "UNAUTHENTICATED", message: "Sign in to access operations." } }, 401, headers);
  const method = request.method;
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!["GET","POST","PATCH"].includes(method)) return json({ error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } }, 405, headers);
  if (method === "PATCH" && (!id || !/^[0-9a-f-]{36}$/i.test(id))) return json({ error: { code: "INVALID_ID", message: "A valid record ID is required." } }, 400, headers);
  let ownerId: string | null = null;
  if (method === "POST") {
    try { ownerId = await verifiedUserId(token, env); }
    catch { return json({ error: { code: "AUTH_PROVIDER_UNAVAILABLE", message: "Could not verify your account." } }, 502, headers); }
    if (!ownerId) return json({ error: { code: "INVALID_SESSION", message: "Your session has expired. Sign in again." } }, 401, headers);
  }

  const filters = new URLSearchParams({ select: OPERATIONS_COLUMNS[resource], order: "created_at.desc", limit: "100" });
  if (method === "PATCH") filters.set("id", "eq." + id);
  if (method === "GET") {
    if (resource === "approval_requests" || resource === "notification_events" || resource === "jobs") {
      const status = url.searchParams.get("status");
      if (status && /^[a-z_]+$/.test(status)) filters.set("status", "eq." + status);
    }
    if (resource === "operation_events") {
      const severity = url.searchParams.get("severity");
      if (severity && ["info","success","warning","error","critical"].includes(severity)) filters.set("severity", "eq." + severity);
    }
  }
  let endpoint = "/rest/v1/" + resource + "?" + filters.toString();
  let body: JsonRecord | undefined;
  if (method === "POST" || method === "PATCH") {
    const input = await readJson(request);
    if (!input) return json({ error: { code: "INVALID_BODY", message: "A valid JSON body is required." } }, 400, headers);
    const allowed: Record<OperationsResource, string[]> = {
      jobs: ["job_type","input","run_after","idempotency_key"],
      operation_schedules: ["name","schedule_type","schedule_config","job_type","job_input","is_enabled","next_run_at"],
      approval_requests: ["job_id","action_type","title","summary","action_payload","risk_level","requested_channels","expires_at"],
      notification_events: ["approval_request_id","job_id","channel","event_type","title","body","scheduled_for","metadata"],
      operation_events: ["job_id","approval_request_id","event_type","severity","title","detail","data"]
    };
    if (resource === "jobs" && method === "PATCH") {
      if (Object.keys(input).some(k => k !== "status") || input.status !== "cancelled") return json({ error: { code: "INVALID_JOB_ACTION", message: "Only cancellation is available until the job runner is implemented." } }, 400, headers);
      body = { status: "cancelled", finished_at: new Date().toISOString() };
      filters.set("id", "eq." + id);
      filters.set("status", "in.(pending,paused,waiting_for_worker,waiting_for_quota,awaiting_approval)");
    } else if (resource === "jobs" && method === "POST") {
      const allowedJobTypes = ["research_scan","business_review","daily_briefing","lead_review","custom"];
      if (!validText(input.job_type,100) || !allowedJobTypes.includes(String(input.job_type))) return json({ error: { code: "INVALID_JOB_TYPE", message: "Choose a supported GiGo job category." } }, 400, headers);
      if (input.input !== undefined && (!input.input || typeof input.input !== "object" || Array.isArray(input.input))) return json({ error: { code: "INVALID_BODY", message: "Job input must be an object." } }, 400, headers);
      if (input.run_after !== undefined && (typeof input.run_after !== "string" || !Number.isFinite(Date.parse(input.run_after)))) return json({ error: { code: "INVALID_DATE", message: "run_after must be a valid timestamp." } }, 400, headers);
      if (input.idempotency_key !== undefined && (typeof input.idempotency_key !== "string" || input.idempotency_key.length < 8 || input.idempotency_key.length > 160)) return json({ error: { code: "INVALID_IDEMPOTENCY_KEY", message: "idempotency_key must contain 8 to 160 characters." } }, 400, headers);
      body = { user_id: ownerId, job_type: input.job_type, input: input.input ?? {}, run_after: input.run_after ?? new Date().toISOString(), idempotency_key: input.idempotency_key ?? crypto.randomUUID(), status: "pending", progress: {}, checkpoint: {}, attempts: 0 };
    } else if (resource === "approval_requests" && method === "PATCH") {
      if (Object.keys(input).some(k => !["status","decision_note"].includes(k))) return json({ error: { code: "INVALID_BODY", message: "Approval decisions can only change status and decision note." } }, 400, headers);
      if (!["approved","rejected"].includes(String(input.status))) return json({ error: { code: "INVALID_DECISION", message: "A decision must be approved or rejected." } }, 400, headers);
      body = { status: input.status, decision_note: typeof input.decision_note === "string" ? input.decision_note.slice(0,2000) : null, decided_at: new Date().toISOString() };
      // Decisions are one-way: only a pending, non-expired request can be decided.
      filters.set("status", "eq.pending");
      filters.set("or", "(expires_at.is.null,expires_at.gt." + new Date().toISOString() + ")");
    } else {
      if (method === "PATCH" && resource !== "operation_schedules") return json({ error: { code: "READ_ONLY_RESOURCE", message: "This operations resource cannot be edited." } }, 405, headers);
      if (Object.keys(input).some(k => !allowed[resource].includes(k))) return json({ error: { code: "INVALID_BODY", message: "Unsupported operations field." } }, 400, headers);
      if (resource === "operation_schedules") {
        if (method === "POST" && (!validText(input.name,160) || !validText(input.job_type,100))) return json({ error: { code: "INVALID_BODY", message: "Schedule name and job_type are required." } }, 400, headers);
        if (input.schedule_type !== undefined && !["interval","daily","weekly","event"].includes(String(input.schedule_type))) return json({ error: { code: "INVALID_SCHEDULE", message: "Invalid schedule type." } }, 400, headers);
        if (input.schedule_config !== undefined && (!input.schedule_config || typeof input.schedule_config !== "object" || Array.isArray(input.schedule_config))) return json({ error: { code: "INVALID_BODY", message: "schedule_config must be an object." } }, 400, headers);
        if (input.job_input !== undefined && (!input.job_input || typeof input.job_input !== "object" || Array.isArray(input.job_input))) return json({ error: { code: "INVALID_BODY", message: "job_input must be an object." } }, 400, headers);
        if (input.is_enabled !== undefined && typeof input.is_enabled !== "boolean") return json({ error: { code: "INVALID_BODY", message: "is_enabled must be boolean." } }, 400, headers);
        if (input.next_run_at !== undefined && input.next_run_at !== null && (typeof input.next_run_at !== "string" || !Number.isFinite(Date.parse(input.next_run_at)))) return json({ error: { code: "INVALID_DATE", message: "next_run_at must be a valid timestamp." } }, 400, headers);
      } else if (resource === "approval_requests") {
        if (method === "POST" && (!validText(input.action_type,100) || !validText(input.title,200) || !validText(input.summary,5000))) return json({ error: { code: "INVALID_BODY", message: "action_type, title and summary are required." } }, 400, headers);
        if (input.risk_level !== undefined && !["low","medium","high","critical"].includes(String(input.risk_level))) return json({ error: { code: "INVALID_RISK", message: "Invalid risk level." } }, 400, headers);
        if (input.action_payload !== undefined && (!input.action_payload || typeof input.action_payload !== "object" || Array.isArray(input.action_payload))) return json({ error: { code: "INVALID_BODY", message: "action_payload must be an object." } }, 400, headers);
        if (input.job_id !== undefined && input.job_id !== null && !/^[0-9a-f-]{36}$/i.test(String(input.job_id))) return json({ error: { code: "INVALID_ID", message: "job_id must be a UUID or null." } }, 400, headers);
      } else if (resource === "notification_events") {
        if (method !== "POST") return json({ error: { code: "READ_ONLY_RESOURCE", message: "Notifications can only be queued, not directly edited." } }, 405, headers);
        if (input.channel !== "in_app" || !validText(input.event_type,100) || !validText(input.title,200) || !validText(input.body,5000)) return json({ error: { code: "INVALID_BODY", message: "Only in-app notifications can be queued until email, push and voice delivery adapters are implemented." } }, 400, headers);
        if (input.scheduled_for !== undefined && (typeof input.scheduled_for !== "string" || !Number.isFinite(Date.parse(input.scheduled_for)))) return json({ error: { code: "INVALID_DATE", message: "scheduled_for must be a valid timestamp." } }, 400, headers);
      } else {
        if (!validText(input.event_type,100) || !validText(input.title,200)) return json({ error: { code: "INVALID_BODY", message: "event_type and title are required." } }, 400, headers);
        if (input.severity !== undefined && !["info","success","warning","error","critical"].includes(String(input.severity))) return json({ error: { code: "INVALID_SEVERITY", message: "Invalid event severity." } }, 400, headers);
      }
      body = { ...input };
      if (method === "POST") body.user_id = ownerId;
      if (resource === "operation_schedules" && method === "POST") {
        body.schedule_type = body.schedule_type ?? "event";
        body.schedule_config = body.schedule_config ?? {};
        body.job_input = body.job_input ?? {};
        body.is_enabled = body.is_enabled ?? true;
      }
      if (resource === "approval_requests" && method === "POST") {
        body.action_payload = body.action_payload ?? {};
        body.risk_level = body.risk_level ?? "medium";
        body.requested_channels = body.requested_channels ?? ["in_app"];
      }
      if (resource === "notification_events" && method === "POST") {
        body.status = "queued";
        body.channel = body.channel;
        body.metadata = body.metadata ?? {};
      }
      if (resource === "operation_events" && method === "POST") body.data = body.data ?? {};

    }
  }
  try {
    const upstream = await fetch(new URL(endpoint, env.SUPABASE_URL!), {
      method,
      headers: { apikey: env.SUPABASE_ANON_KEY!, authorization: "Bearer " + token, accept: "application/json", ...(body ? { "content-type": "application/json", prefer: "return=representation" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const raw = await upstream.text();
    const payload = raw ? JSON.parse(raw) : null;
    if (!upstream.ok) return json({ error: { code: "OPERATIONS_STORAGE_FAILED", message: upstream.status >= 500 ? "Operations storage failed. Confirm migration 0008 has been applied." : (payload?.message ?? "The operations request was rejected.") } }, upstream.status >= 500 ? 502 : upstream.status, headers);
    if (method === "PATCH" && Array.isArray(payload) && payload.length === 0) return json({ error: { code: "NOT_FOUND", message: "Operations record not found." } }, 404, headers);
    return json({ data: payload ?? [] }, method === "POST" ? 201 : 200, headers);
  } catch {
    return json({ error: { code: "DATABASE_UNAVAILABLE", message: "Operations storage is temporarily unavailable." } }, 502, headers);
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

    const researchRoutes: Record<string, ResearchResource> = {
      "/api/v1/research/runs": "research_runs",
      "/api/v1/research/sources": "research_sources",
      "/api/v1/research/opportunities": "research_opportunities",
    };
    const businessRoutes: Record<string, BusinessResource> = { "/api/v1/products": "products", "/api/v1/partners": "partner_candidates", "/api/v1/leads": "leads", "/api/v1/offers": "offers" };
    const businessResource = businessRoutes[url.pathname];
    if (businessResource) return handleBusinessResource(request, env, headers, businessResource);

    const researchResource = researchRoutes[url.pathname];
    if (researchResource) return handleResearchResource(request, env, headers, researchResource);

    const assistantRoutes: Record<string, AssistantResource> = {
      "/api/v1/conversations": "assistant_conversations",
      "/api/v1/messages": "assistant_messages",
      "/api/v1/memory": "memory_items",
    };
    const assistantResource = assistantRoutes[url.pathname];
    if (assistantResource) return handleAssistantResource(request, env, headers, assistantResource);

    const operationsRoutes: Record<string, OperationsResource> = {
      "/api/v1/operations/jobs": "jobs",
      "/api/v1/operations/schedules": "operation_schedules",
      "/api/v1/operations/approvals": "approval_requests",
      "/api/v1/operations/notifications": "notification_events",
      "/api/v1/operations/events": "operation_events"
    };
    const operationsResource = operationsRoutes[url.pathname];
    if (operationsResource) return handleOperationsResource(request, env, headers, operationsResource);

    if (url.pathname === "/api/v1/assistant/history/import") return handleChatGPTHistoryImport(request, env, headers);

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
      const pageRoutes = new Set(["/login", "/overview", "/operations", "/assistant", "/projects", "/tasks", "/research", "/products", "/partners", "/leads", "/offers", "/marketing", "/outreach", "/launch", "/commerce", "/creative", "/customers", "/analytics", "/learning", "/settings"]);
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
