export interface MaxunEnv {
  MAXUN_BASE_URL?: string;
  MAXUN_API_KEY?: string;
}

type VerifyOwner = () => Promise<string | null>;

function json(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function configured(env: MaxunEnv): boolean {
  return Boolean(env.MAXUN_BASE_URL && env.MAXUN_API_KEY);
}

function safeBaseUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) return null;
    return new URL(url.origin + url.pathname.replace(/\/+$/, ""));
  } catch {
    return null;
  }
}

async function maxunFetch(env: MaxunEnv, path: string, method = "GET"): Promise<{ ok: boolean; status: number; data: unknown }> {
  const base = safeBaseUrl(env.MAXUN_BASE_URL ?? "");
  if (!base || !env.MAXUN_API_KEY) throw new Error("Maxun is not configured with a valid HTTPS base URL and API key.");
  const url = new URL(base.toString().replace(/\/+$/, "") + "/api" + path);
  const response = await fetch(url, {
    method,
    headers: { "x-api-key": env.MAXUN_API_KEY, accept: "application/json" },
    signal: AbortSignal.timeout(20000)
  });
  const raw = await response.text();
  if (raw.length > 1_000_000) throw new Error("Maxun returned a response larger than the GiGo integration limit.");
  let data: unknown = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { message: "Maxun returned a non-JSON response." }; }
  return { ok: response.ok, status: response.status, data };
}

export async function handleMaxunRequest(
  request: Request,
  env: MaxunEnv,
  pathname: string,
  verifyOwner: VerifyOwner
): Promise<Response> {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: { code: "UNAUTHENTICATED", message: "Sign in to access the collection engine." } }, 401);
  let ownerId: string | null = null;
  try { ownerId = await verifyOwner(); } catch { /* handled below */ }
  if (!ownerId) return json({ error: { code: "INVALID_SESSION", message: "Your GiGo session could not be verified." } }, 401);

  if (request.method === "GET" && pathname === "/api/v1/integrations/maxun/status") {
    if (!configured(env)) return json({ data: { configured: false, connected: false, mode: "self-hosted", message: "Maxun has not been deployed or connected yet." } });
    try {
      const result = await maxunFetch(env, "/robots");
      if (!result.ok) return json({ data: { configured: true, connected: false, mode: "self-hosted", status_code: result.status, message: "GiGo could reach the configured service, but Maxun rejected the API request. Check its API key." } });
      const payload = result.data as { data?: unknown; robots?: unknown };
      const robots = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.robots) ? payload.robots : [];
      return json({ data: { configured: true, connected: true, mode: "self-hosted", robot_count: robots.length, message: "Maxun API connection verified." } });
    } catch {
      return json({ data: { configured: true, connected: false, mode: "self-hosted", message: "GiGo could not connect to Maxun. Check that the service is online and publicly reachable over HTTPS." } });
    }
  }

  if (!configured(env)) return json({ error: { code: "MAXUN_NOT_CONFIGURED", message: "Deploy Maxun and configure MAXUN_BASE_URL and MAXUN_API_KEY as Cloudflare Worker secrets first." } }, 503);

  if (request.method === "GET" && pathname === "/api/v1/integrations/maxun/robots") {
    try {
      const result = await maxunFetch(env, "/robots");
      return json(result.ok ? { data: result.data } : { error: { code: "MAXUN_REQUEST_FAILED", message: "Maxun could not list robots.", status_code: result.status } }, result.ok ? 200 : 502);
    } catch {
      return json({ error: { code: "MAXUN_UNAVAILABLE", message: "Maxun is unavailable or its configuration is invalid." } }, 502);
    }
  }

  const runMatch = pathname.match(/^\/api\/v1\/integrations\/maxun\/robots\/([A-Za-z0-9_-]{1,100})\/runs$/);
  const detailMatch = pathname.match(/^\/api\/v1\/integrations\/maxun\/robots\/([A-Za-z0-9_-]{1,100})\/runs\/([A-Za-z0-9_-]{1,100})$/);
  if (runMatch && request.method === "POST") {
    try {
      const result = await maxunFetch(env, "/robots/" + encodeURIComponent(runMatch[1]) + "/runs", "POST");
      return json(result.ok ? { data: result.data } : { error: { code: "MAXUN_RUN_FAILED", message: "Maxun rejected the robot run request.", status_code: result.status } }, result.ok ? 202 : 502);
    } catch {
      return json({ error: { code: "MAXUN_UNAVAILABLE", message: "Maxun is unavailable or its configuration is invalid." } }, 502);
    }
  }
  if (detailMatch && request.method === "GET") {
    try {
      const result = await maxunFetch(env, "/robots/" + encodeURIComponent(detailMatch[1]) + "/runs/" + encodeURIComponent(detailMatch[2]));
      return json(result.ok ? { data: result.data } : { error: { code: "MAXUN_RUN_NOT_FOUND", message: "Maxun could not retrieve that run.", status_code: result.status } }, result.ok ? 200 : result.status === 404 ? 404 : 502);
    } catch {
      return json({ error: { code: "MAXUN_UNAVAILABLE", message: "Maxun is unavailable or its configuration is invalid." } }, 502);
    }
  }

  return json({ error: { code: "MAXUN_ROUTE_NOT_FOUND", message: "That Maxun integration operation is not supported." } }, 404);
}
