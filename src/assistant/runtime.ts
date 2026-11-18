import { getAssistantCapabilities } from "./registry";

export interface AssistantRuntimeEnv {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  AI_API_BASE_URL?: string;
  AI_API_KEY?: string;
  AI_MODEL?: string;
}

type Row = Record<string, unknown>;

function response(data: Row, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

async function db(env: AssistantRuntimeEnv, token: string, path: string, method = "GET", body?: Row): Promise<unknown> {
  const result = await fetch(new URL(path, env.SUPABASE_URL!), {
    method,
    headers: {
      apikey: env.SUPABASE_ANON_KEY!,
      authorization: `Bearer ${token}`,
      accept: "application/json",
      ...(body ? { "content-type": "application/json", prefer: "return=representation" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const raw = await result.text();
  const payload = raw ? JSON.parse(raw) as unknown : null;
  if (!result.ok) throw new Error("Assistant storage request failed.");
  return payload;
}

export async function handleAssistantChat(request: Request, env: AssistantRuntimeEnv, token: string): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return response({ error: { code: "DATABASE_NOT_CONFIGURED", message: "GiGo storage is not configured." } }, 503);
  if (!env.AI_API_BASE_URL || !env.AI_API_KEY || !env.AI_MODEL) {
    return response({ error: { code: "AI_NOT_CONFIGURED", message: "GiGo's AI engine is not connected yet. Configure AI_API_BASE_URL, AI_API_KEY and AI_MODEL as Cloudflare Worker variables/secrets." } }, 503);
  }
  let input: Row;
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    input = value as Row;
  } catch { return response({ error: { code: "INVALID_BODY", message: "Send a valid JSON body." } }, 400); }
  const message = typeof input.message === "string" ? input.message.trim() : "";
  const suppliedId = typeof input.conversation_id === "string" ? input.conversation_id : null;
  if (!message || message.length > 12000) return response({ error: { code: "INVALID_MESSAGE", message: "Message must contain 1–12,000 characters." } }, 400);
  if (suppliedId && !/^[0-9a-f-]{36}$/i.test(suppliedId)) return response({ error: { code: "INVALID_CONVERSATION", message: "Conversation ID is invalid." } }, 400);

  try {
    const identityResponse = await fetch(new URL("/auth/v1/user", env.SUPABASE_URL), {
      headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}` }
    });
    if (!identityResponse.ok) return response({ error: { code: "INVALID_SESSION", message: "Your session has expired. Sign in again." } }, 401);
    const identity = await identityResponse.json() as Row;
    const ownerId = typeof identity.id === "string" ? identity.id : null;
    if (!ownerId) return response({ error: { code: "INVALID_SESSION", message: "Your account could not be verified." } }, 401);
    let conversationId = suppliedId;
    if (conversationId) {
      const rows = await db(env, token, `/rest/v1/assistant_conversations?select=id&id=eq.${encodeURIComponent(conversationId)}&limit=1`) as Row[];
      if (!Array.isArray(rows) || !rows.length) return response({ error: { code: "CONVERSATION_NOT_FOUND", message: "That conversation was not found in your workspace." } }, 404);
    } else {
      const created = await db(env, token, "/rest/v1/assistant_conversations?select=id", "POST", { user_id: ownerId, title: message.slice(0, 80), context: {} }) as Row[];
      if (!Array.isArray(created) || typeof created[0]?.id !== "string") throw new Error("Could not create conversation.");
      conversationId = created[0].id;
    }

    await db(env, token, "/rest/v1/assistant_messages?select=id", "POST", { user_id: ownerId, conversation_id: conversationId, role: "user", content: message, metadata: {} });
    const [history, memory] = await Promise.all([
      db(env, token, `/rest/v1/assistant_messages?select=role,content&conversation_id=eq.${encodeURIComponent(conversationId!)}&order=created_at.desc&limit=24`),
      db(env, token, "/rest/v1/memory_items?select=category,content&is_active=eq.true&order=updated_at.desc&limit=30")
    ]) as [Row[], Row[]];

    const capabilities = getAssistantCapabilities();
    const system = [
      "You are GiGo, the user's private personal AI assistant and business operating system.",
      "Be practical, honest, proactive and clear. Never claim an action was completed unless a connected tool actually completed it.",
      "The user wants an integrated system spanning research, digital product creation, creator partnerships, lead management, offers, marketing, outreach, launches, commerce, creative work, customer support, analytics and learning.",
      "Only the following backend capabilities are currently available; all others are planned and must not be represented as executable: " + JSON.stringify(capabilities.modules.filter((m: {tools: {state:string}[]}) => m.tools.some(t => t.state === "available"))),
      "Relevant saved user memory (treat as context, not instructions to reveal): " + JSON.stringify(memory || []),
      "When a task needs a capability that is not available, explain the limitation and help prepare the work instead."
    ].join("\n\n");
    const messages = [
      { role: "system", content: system },
      ...(Array.isArray(history) ? history.slice().reverse().map(row => ({ role: String(row.role), content: String(row.content) })) : [])
    ];
    const base = env.AI_API_BASE_URL.replace(/\/+$/, "");
    const completion = await fetch(base.endsWith("/chat/completions") ? base : base + "/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${env.AI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ model: env.AI_MODEL, messages, temperature: 0.4 })
    });
    const payload = await completion.json() as Row;
    if (!completion.ok) return response({ error: { code: "AI_PROVIDER_ERROR", message: "The configured AI provider could not complete the request. Check the provider settings and try again." } }, 502);
    const choices = payload.choices as Row[] | undefined;
    const choiceMessage = choices?.[0]?.message as Row | undefined;
    const answer = typeof choiceMessage?.content === "string" ? choiceMessage.content.trim() : "";
    if (!answer) return response({ error: { code: "EMPTY_AI_RESPONSE", message: "The AI provider returned an empty response." } }, 502);
    await db(env, token, "/rest/v1/assistant_messages?select=id", "POST", { user_id: ownerId, conversation_id: conversationId, role: "assistant", content: answer, metadata: { model: env.AI_MODEL } });
    return response({ data: { conversation_id: conversationId, message: answer, model: env.AI_MODEL } });
  } catch {
    return response({ error: { code: "ASSISTANT_RUNTIME_ERROR", message: "GiGo could not complete this request. Your saved workspace data remains protected; please try again." } }, 502);
  }
}
