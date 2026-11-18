import { getAssistantCapabilities } from "./registry";

export interface AssistantRuntimeEnv {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  AI_API_BASE_URL?: string;
  AI_API_KEY?: string;
  AI_MODEL?: string;
}

type Row = Record<string, unknown>;
type ToolCall = { id?: string; type?: string; function?: { name?: string; arguments?: string } };

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
  let payload: unknown = null;
  try { payload = raw ? JSON.parse(raw) as unknown : null; } catch { throw new Error("Database returned an unreadable response."); }
  if (!result.ok) throw new Error("Assistant storage request failed.");
  return payload;
}

const TOOL_DEFINITIONS = [
  { type: "function", function: { name: "projects_list", description: "List the owner's projects.", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "projects_create", description: "Create a project in the owner's GiGo workspace.", parameters: { type: "object", properties: { name: { type: "string", minLength: 1, maxLength: 160 }, description: { type: ["string", "null"], maxLength: 5000 } }, required: ["name"], additionalProperties: false } } },
  { type: "function", function: { name: "tasks_list", description: "List the owner's tasks. Optionally filter by project_id or status.", parameters: { type: "object", properties: { project_id: { type: "string" }, status: { type: "string", enum: ["todo", "in_progress", "blocked", "done", "cancelled"] } }, additionalProperties: false } } },
  { type: "function", function: { name: "tasks_create", description: "Create a task in the owner's GiGo workspace.", parameters: { type: "object", properties: { title: { type: "string", minLength: 1, maxLength: 240 }, description: { type: ["string", "null"], maxLength: 5000 }, project_id: { type: ["string", "null"] }, priority: { type: "string", enum: ["low", "normal", "high", "urgent"] }, due_at: { type: ["string", "null"] } }, required: ["title"], additionalProperties: false } } },
  { type: "function", function: { name: "tasks_update_status", description: "Update the status of one existing task owned by the user.", parameters: { type: "object", properties: { id: { type: "string" }, status: { type: "string", enum: ["todo", "in_progress", "blocked", "done", "cancelled"] } }, required: ["id", "status"], additionalProperties: false } } }
];

function isObject(value: unknown): value is Row {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function validUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function executeTool(name: string, args: Row, env: AssistantRuntimeEnv, token: string, ownerId: string): Promise<Row> {
  if (name === "projects_list") {
    const rows = await db(env, token, "/rest/v1/projects?select=id,name,description,status,created_at,updated_at&order=updated_at.desc&limit=100") as Row[];
    return { projects: rows };
  }
  if (name === "projects_create") {
    const projectName = typeof args.name === "string" ? args.name.trim() : "";
    if (!projectName || projectName.length > 160) return { error: "Project name must be 1–160 characters." };
    if (args.description !== undefined && args.description !== null && (typeof args.description !== "string" || args.description.length > 5000)) return { error: "Description must be text up to 5,000 characters." };
    const rows = await db(env, token, "/rest/v1/projects?select=id,name,description,status,created_at", "POST", { user_id: ownerId, name: projectName, description: args.description ?? null, status: "active" }) as Row[];
    return { created: rows?.[0] ?? null };
  }
  if (name === "tasks_list") {
    const params = new URLSearchParams({ select: "id,project_id,title,description,status,priority,due_at,completed_at,created_at,updated_at", order: "created_at.desc", limit: "100" });
    if (args.project_id !== undefined) {
      if (!validUuid(args.project_id)) return { error: "project_id must be a valid UUID." };
      params.set("project_id", `eq.${args.project_id}`);
    }
    if (args.status !== undefined) {
      if (!["todo", "in_progress", "blocked", "done", "cancelled"].includes(String(args.status))) return { error: "Invalid task status." };
      params.set("status", `eq.${args.status}`);
    }
    return { tasks: await db(env, token, `/rest/v1/tasks?${params.toString()}`) };
  }
  if (name === "tasks_create") {
    const title = typeof args.title === "string" ? args.title.trim() : "";
    if (!title || title.length > 240) return { error: "Task title must be 1–240 characters." };
    if (args.description !== undefined && args.description !== null && (typeof args.description !== "string" || args.description.length > 5000)) return { error: "Description must be text up to 5,000 characters." };
    if (args.project_id !== undefined && args.project_id !== null && !validUuid(args.project_id)) return { error: "project_id must be a valid UUID or null." };
    const priority = args.priority ?? "normal";
    if (!["low", "normal", "high", "urgent"].includes(String(priority))) return { error: "Invalid task priority." };
    const dueAt = args.due_at ?? null;
    if (dueAt !== null && (typeof dueAt !== "string" || !Number.isFinite(Date.parse(dueAt)))) return { error: "due_at must be a valid date or null." };
    const rows = await db(env, token, "/rest/v1/tasks?select=id,project_id,title,description,status,priority,due_at,created_at", "POST", {
      user_id: ownerId, project_id: args.project_id ?? null, title, description: args.description ?? null,
      status: "todo", priority, due_at: dueAt, completed_at: null
    }) as Row[];
    return { created: rows?.[0] ?? null };
  }
  if (name === "tasks_update_status") {
    if (!validUuid(args.id)) return { error: "A valid task id is required." };
    if (!["todo", "in_progress", "blocked", "done", "cancelled"].includes(String(args.status))) return { error: "Invalid task status." };
    const rows = await db(env, token, `/rest/v1/tasks?id=eq.${encodeURIComponent(args.id)}&select=id,title,status,completed_at,updated_at`, "PATCH", {
      status: args.status, completed_at: args.status === "done" ? new Date().toISOString() : null
    }) as Row[];
    return rows?.length ? { updated: rows[0] } : { error: "Task not found in this workspace." };
  }
  return { error: "This tool is not on GiGo's executable allowlist." };
}

async function callModel(env: AssistantRuntimeEnv, messages: Row[], withTools: boolean): Promise<Row> {
  const base = env.AI_API_BASE_URL!.replace(/\/+$/, "");
  const result = await fetch(base.endsWith("/chat/completions") ? base : base + "/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${env.AI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: env.AI_MODEL, messages, temperature: 0.3, ...(withTools ? { tools: TOOL_DEFINITIONS, tool_choice: "auto" } : {}) })
  });
  const payload = await result.json() as Row;
  if (!result.ok) throw new Error("AI provider request failed.");
  const choices = payload.choices as Row[] | undefined;
  const choice = choices?.[0] as Row | undefined;
  const message = choice?.message as Row | undefined;
  if (!message) throw new Error("AI provider returned an invalid response.");
  return message;
}

export async function handleAssistantChat(request: Request, env: AssistantRuntimeEnv, token: string): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return response({ error: { code: "DATABASE_NOT_CONFIGURED", message: "GiGo storage is not configured." } }, 503);
  if (!env.AI_API_BASE_URL || !env.AI_API_KEY || !env.AI_MODEL) {
    return response({ error: { code: "AI_NOT_CONFIGURED", message: "GiGo's AI engine is not connected yet. Configure AI_API_BASE_URL, AI_API_KEY and AI_MODEL as Cloudflare Worker variables/secrets." } }, 503);
  }
  let input: Row;
  try {
    const value: unknown = await request.json();
    if (!isObject(value)) throw new Error();
    input = value;
  } catch { return response({ error: { code: "INVALID_BODY", message: "Send a valid JSON body." } }, 400); }
  const userMessage = typeof input.message === "string" ? input.message.trim() : "";
  const suppliedId = typeof input.conversation_id === "string" ? input.conversation_id : null;
  if (!userMessage || userMessage.length > 12000) return response({ error: { code: "INVALID_MESSAGE", message: "Message must contain 1–12,000 characters." } }, 400);
  if (suppliedId && !validUuid(suppliedId)) return response({ error: { code: "INVALID_CONVERSATION", message: "Conversation ID is invalid." } }, 400);

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
      const created = await db(env, token, "/rest/v1/assistant_conversations?select=id", "POST", { user_id: ownerId, title: userMessage.slice(0, 80), context: {} }) as Row[];
      if (!Array.isArray(created) || typeof created[0]?.id !== "string") throw new Error("Could not create conversation.");
      conversationId = created[0].id as string;
    }

    await db(env, token, "/rest/v1/assistant_messages?select=id", "POST", { user_id: ownerId, conversation_id: conversationId, role: "user", content: userMessage, metadata: {} });
    const [history, memory] = await Promise.all([
      db(env, token, `/rest/v1/assistant_messages?select=role,content&conversation_id=eq.${encodeURIComponent(conversationId!)}&order=created_at.desc&limit=24`),
      db(env, token, "/rest/v1/memory_items?select=category,content&is_active=eq.true&order=updated_at.desc&limit=30")
    ]) as [Row[], Row[]];

    const capabilities = getAssistantCapabilities();
    const available = capabilities.modules.flatMap((module: { name: string; tools: { id: string; state: string; description: string }[] }) =>
      module.tools.filter(tool => tool.state === "available").map(tool => ({ id: tool.id, description: tool.description })));
    const system = [
      "You are GiGo, the user's private personal AI assistant and business operating system.",
      "Be practical, honest and clear. Never claim an action was completed unless an executable tool returned confirmation.",
      "You may use the tools provided to read or change the user's own projects and tasks. Use them when the user asks you to inspect, create or update those records.",
      "Never invent tool results. Ask a concise clarifying question when required arguments are missing. Never attempt external actions such as sending email, publishing, spending money or signing agreements; those capabilities are not executable.",
      "GiGo is intended to support research, digital product creation, creator partnerships, lead management, offers, marketing, outreach, launches, commerce, creative work, customer support, analytics and learning. These wider modules are not yet executable.",
      "Currently executable capability registry: " + JSON.stringify(available),
      "Relevant saved user memory: " + JSON.stringify(memory || []),
      "When a request needs a capability that is not available, explain the limitation and help prepare the work instead."
    ].join("\n\n");
    const messages: Row[] = [
      { role: "system", content: system },
      ...(Array.isArray(history) ? history.slice().reverse().map(row => ({ role: String(row.role), content: String(row.content) })) : [])
    ];

    let finalAnswer = "";
    for (let round = 0; round < 4; round++) {
      const modelMessage = await callModel(env, messages, true);
      const toolCalls = Array.isArray(modelMessage.tool_calls) ? modelMessage.tool_calls as ToolCall[] : [];
      if (!toolCalls.length) {
        finalAnswer = typeof modelMessage.content === "string" ? modelMessage.content.trim() : "";
        break;
      }
      messages.push({ role: "assistant", content: modelMessage.content ?? null, tool_calls: toolCalls });
      for (const call of toolCalls.slice(0, 5)) {
        const callId = typeof call.id === "string" ? call.id : `call_${round}_${messages.length}`;
        const name = call.function?.name ?? "";
        let args: Row = {};
        try {
          const parsed: unknown = JSON.parse(call.function?.arguments ?? "{}");
          if (!isObject(parsed)) throw new Error();
          args = parsed;
        } catch {
          const invalid = { error: "Tool arguments were not valid JSON." };
          messages.push({ role: "tool", tool_call_id: callId, content: JSON.stringify(invalid) });
          continue;
        }
        let result: Row;
        try { result = await executeTool(name, args, env, token, ownerId); }
        catch { result = { error: "The requested workspace operation failed. No success is being reported." }; }
        const toolContent = JSON.stringify(result);
        messages.push({ role: "tool", tool_call_id: callId, content: toolContent });
        await db(env, token, "/rest/v1/assistant_messages?select=id", "POST", {
          user_id: ownerId, conversation_id: conversationId, role: "tool", content: toolContent,
          metadata: { tool_name: name, tool_call_id: callId }
        });
      }
    }
    if (!finalAnswer) {
      const finalMessage = await callModel(env, messages, false);
      finalAnswer = typeof finalMessage.content === "string" ? finalMessage.content.trim() : "";
    }
    if (!finalAnswer) return response({ error: { code: "EMPTY_AI_RESPONSE", message: "The AI provider returned an empty response." } }, 502);
    await db(env, token, "/rest/v1/assistant_messages?select=id", "POST", { user_id: ownerId, conversation_id: conversationId, role: "assistant", content: finalAnswer, metadata: { model: env.AI_MODEL } });
    return response({ data: { conversation_id: conversationId, message: finalAnswer, model: env.AI_MODEL } });
  } catch {
    return response({ error: { code: "ASSISTANT_RUNTIME_ERROR", message: "GiGo could not complete this request. Your saved workspace data remains protected; please try again." } }, 502);
  }
}
