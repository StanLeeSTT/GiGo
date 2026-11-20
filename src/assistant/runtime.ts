import { getAssistantCapabilities } from "./registry";
import { callAIModel, providerPoolStatus } from "./providers";

export interface AssistantRuntimeEnv {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  AI_PROVIDER_POOL?: string;
  AI_API_BASE_URL?: string;
  AI_API_KEY?: string;
  AI_MODEL?: string;
  NVIDIA_NIM_API_KEY?: string;
  NVIDIA_NIM_MODEL?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_AI_TOKEN?: string;
  CLOUDFLARE_AI_MODEL?: string;
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
  { type: "function", function: { name: "tasks_update_status", description: "Update the status of one existing task owned by the user.", parameters: { type: "object", properties: { id: { type: "string" }, status: { type: "string", enum: ["todo", "in_progress", "blocked", "done", "cancelled"] } }, required: ["id", "status"], additionalProperties: false } } },
  { type: "function", function: { name: "conversations_list", description: "List the owner's saved GiGo conversations.", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "conversations_create", description: "Create a saved GiGo conversation.", parameters: { type: "object", properties: { title: { type: ["string", "null"], maxLength: 160 } }, additionalProperties: false } } },
  { type: "function", function: { name: "messages_list", description: "Read messages from one conversation owned by the user.", parameters: { type: "object", properties: { conversation_id: { type: "string" } }, required: ["conversation_id"], additionalProperties: false } } },
  { type: "function", function: { name: "messages_add", description: "Save a user or assistant message in an owned conversation.", parameters: { type: "object", properties: { conversation_id: { type: "string" }, role: { type: "string", enum: ["user", "assistant"] }, content: { type: "string", minLength: 1, maxLength: 20000 } }, required: ["conversation_id", "role", "content"], additionalProperties: false } } },
  { type: "function", function: { name: "memory_search", description: "Search the owner's saved memories for information relevant to a natural-language query. Use this before answering questions about remembered preferences, decisions or project context.", parameters: { type: "object", properties: { query: { type: "string", minLength: 1, maxLength: 500 } }, required: ["query"], additionalProperties: false } } },
  { type: "function", function: { name: "memory_update", description: "Update an existing saved memory when the user explicitly asks to correct or change it. Do not use to silently overwrite facts.", parameters: { type: "object", properties: { id: { type: "string" }, content: { type: "string", minLength: 1, maxLength: 5000 }, category: { type: "string", maxLength: 80 } }, required: ["id", "content"], additionalProperties: false } } },
  { type: "function", function: { name: "conversations_search", description: "Search the owner's saved conversation messages for prior decisions, project details or instructions. Use when the user asks what was discussed previously.", parameters: { type: "object", properties: { query: { type: "string", minLength: 1, maxLength: 300 } }, required: ["query"], additionalProperties: false } } },
  { type: "function", function: { name: "memory_list", description: "List the owner's active saved memory items.", parameters: { type: "object", properties: { include_archived: { type: "boolean" } }, additionalProperties: false } } },
  { type: "function", function: { name: "memory_create", description: "Save a useful fact or preference to the owner's GiGo memory.", parameters: { type: "object", properties: { category: { type: "string", maxLength: 80 }, content: { type: "string", minLength: 1, maxLength: 5000 }, source: { type: "string", maxLength: 80 } }, required: ["content"], additionalProperties: false } } },
  { type: "function", function: { name: "memory_archive", description: "Archive one of the owner's saved memory items without deleting it.", parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false } } }
];

function isObject(value: unknown): value is Row {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function validUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function executeTool(name: string, args: Row, env: AssistantRuntimeEnv, token: string, ownerId: string, excludedMessageId?: string): Promise<Row> {
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
  if (name === "conversations_list") {
    return { conversations: await db(env, token, "/rest/v1/assistant_conversations?select=id,title,created_at,updated_at&order=updated_at.desc&limit=50") as Row[] };
  }
  if (name === "conversations_create") {
    const title = args.title ?? null;
    if (title !== null && (typeof title !== "string" || title.length > 160)) return { error: "Conversation title must be text up to 160 characters or null." };
    const rows = await db(env, token, "/rest/v1/assistant_conversations?select=id,title,context,created_at", "POST", { user_id: ownerId, title, context: {} }) as Row[];
    return { created: rows?.[0] ?? null };
  }
  if (name === "messages_list") {
    if (!validUuid(args.conversation_id)) return { error: "A valid conversation_id is required." };
    const params = new URLSearchParams({ select: "id,conversation_id,role,content,metadata,created_at", conversation_id: `eq.${args.conversation_id}`, order: "created_at.asc", limit: "200" });
    return { messages: await db(env, token, `/rest/v1/assistant_messages?${params.toString()}`) as Row[] };
  }
  if (name === "messages_add") {
    if (!validUuid(args.conversation_id)) return { error: "A valid conversation_id is required." };
    if (!["user", "assistant"].includes(String(args.role))) return { error: "Message role must be user or assistant." };
    if (typeof args.content !== "string" || !args.content.trim() || args.content.length > 20000) return { error: "Message content must be 1–20,000 characters." };
    const rows = await db(env, token, "/rest/v1/assistant_messages?select=id,conversation_id,role,content,created_at", "POST", { user_id: ownerId, conversation_id: args.conversation_id, role: args.role, content: args.content, metadata: {} }) as Row[];
    return { created: rows?.[0] ?? null };
  }
  if (name === "memory_search") {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query || query.length > 500) return { error: "A search query of 1–500 characters is required." };
    const rows = await db(env, token, "/rest/v1/memory_items?select=id,category,content,source,confidence,is_active,created_at,updated_at&is_active=eq.true&order=updated_at.desc&limit=100") as Row[];
    const terms = [...new Set(query.toLowerCase().split(/[^a-z0-9]+/).filter(term => term.length > 2))];
    const ranked = (Array.isArray(rows) ? rows : []).map(row => {
      const haystack = (String(row.category ?? "") + " " + String(row.content ?? "")).toLowerCase();
      const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? (String(row.content ?? "").toLowerCase().includes(term) ? 2 : 1) : 0), 0);
      return { row, score };
    }).filter(item => item.score > 0).sort((a,b) => b.score-a.score || String(b.row.updated_at ?? "").localeCompare(String(a.row.updated_at ?? ""))).slice(0,10);
    return { query, matches: ranked.map(item => ({ ...item.row, relevance: item.score })), searched_count: rows.length };
  }
  if (name === "memory_update") {
    if (!validUuid(args.id)) return { error: "A valid memory item id is required." };
    if (typeof args.content !== "string" || !args.content.trim() || args.content.length > 5000) return { error: "Memory content must be 1–5,000 characters." };
    const patch: Row = { content: args.content.trim() };
    if (args.category !== undefined) {
      if (typeof args.category !== "string" || args.category.length > 80) return { error: "Category must be text up to 80 characters." };
      patch.category = args.category;
    }
    const rows = await db(env, token, `/rest/v1/memory_items?id=eq.${encodeURIComponent(args.id)}&is_active=eq.true&select=id,category,content,source,confidence,is_active,updated_at`, "PATCH", patch) as Row[];
    return rows?.length ? { updated: rows[0] } : { error: "Active memory item not found in this workspace." };
  }
  if (name === "conversations_search") {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query || query.length > 300) return { error: "A search query of 1–300 characters is required." };
    const stopWords = new Set(["the","and","for","with","from","that","this","about","what","when","where","were","have","has","had","our","your","their","into","onto","then","than","them","they","you","are","was","how","why","who","which","previous","conversation","conversations","discussion","discussions","please","tell","show","find","search"]);
    const terms = [...new Set(query.toLowerCase().split(/[^a-z0-9]+/).filter(term => term.length >= 3 && !stopWords.has(term)))].slice(0, 10);
    if (!terms.length) return { error: "Please provide at least one specific search term." };
    const params = new URLSearchParams({
      select: "id,conversation_id,role,content,created_at",
      or: `(${terms.map(term => `content.ilike.*${term}*`).join(",")})`,
      order: "created_at.desc",
      limit: "200"
    });
    if (excludedMessageId && validUuid(excludedMessageId)) params.set("id", `neq.${excludedMessageId}`);
    const rows = await db(env, token, `/rest/v1/assistant_messages?${params.toString()}`) as Row[];
    const ranked = (Array.isArray(rows) ? rows : []).map(row => {
      const content = String(row.content ?? "").toLowerCase();
      const matchedTerms = terms.filter(term => content.includes(term));
      const coverage = matchedTerms.length / terms.length;
      const phrase = query.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const normalized = content.replace(/[^a-z0-9]+/g, " ");
      const phraseMatch = phrase.length >= 8 && normalized.includes(phrase);
      const score = matchedTerms.length * 3 + coverage * 4 + (phraseMatch ? 8 : 0) + (row.role === "user" ? 1 : 0);
      return { row, score, matched_terms: matchedTerms };
    }).filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || String(b.row.created_at ?? "").localeCompare(String(a.row.created_at ?? "")))
      .slice(0, 25);
    const conversationIds = [...new Set(ranked.map(item => String(item.row.conversation_id ?? "")).filter(validUuid))];
    let titles: Row[] = [];
    if (conversationIds.length) {
      const titleParams = new URLSearchParams({ select: "id,title,created_at", id: `in.(${conversationIds.join(",")})` });
      titles = await db(env, token, `/rest/v1/assistant_conversations?${titleParams.toString()}`) as Row[];
    }
    const titleMap = new Map((Array.isArray(titles) ? titles : []).map(row => [String(row.id), row.title ?? null]));
    return {
      query,
      searched_terms: terms,
      searched_messages: Array.isArray(rows) ? rows.length : 0,
      matches: ranked.map(item => ({
        ...item.row,
        conversation_title: titleMap.get(String(item.row.conversation_id)) ?? null,
        matched_terms: item.matched_terms,
        relevance: Math.round(item.score * 10) / 10
      }))
    };
  }
  if (name === "memory_list") {
    const params = new URLSearchParams({ select: "id,category,content,source,confidence,is_active,created_at,updated_at", order: "updated_at.desc", limit: "100" });
    if (args.include_archived !== true) params.set("is_active", "eq.true");
    return { memory: await db(env, token, `/rest/v1/memory_items?${params.toString()}`) as Row[] };
  }
  if (name === "memory_create") {
    if (typeof args.content !== "string" || !args.content.trim() || args.content.length > 5000) return { error: "Memory content must be 1–5,000 characters." };
    const category = args.category ?? "general";
    const source = args.source ?? "assistant";
    if (typeof category !== "string" || category.length > 80 || typeof source !== "string" || source.length > 80) return { error: "Category and source must be text up to 80 characters." };
    const normalized = args.content.trim().toLowerCase().replace(/\s+/g, " ");
    const existing = await db(env, token, `/rest/v1/memory_items?select=id,category,content,is_active&category=eq.${encodeURIComponent(category)}&is_active=eq.true&order=updated_at.desc&limit=100`) as Row[];
    const duplicate = (Array.isArray(existing) ? existing : []).find(row => String(row.content ?? "").trim().toLowerCase().replace(/\s+/g, " ") === normalized);
    if (duplicate) return { already_exists: duplicate, note: "An identical active memory already exists; no duplicate was created." };
    const rows = await db(env, token, "/rest/v1/memory_items?select=id,category,content,source,confidence,is_active,created_at", "POST", { user_id: ownerId, category, content: args.content.trim(), source, confidence: 1, is_active: true }) as Row[];
    return { created: rows?.[0] ?? null };
  }
  if (name === "memory_archive") {
    if (!validUuid(args.id)) return { error: "A valid memory item id is required." };
    const rows = await db(env, token, `/rest/v1/memory_items?id=eq.${encodeURIComponent(args.id)}&select=id,category,content,is_active,updated_at`, "PATCH", { is_active: false }) as Row[];
    return rows?.length ? { archived: rows[0] } : { error: "Memory item not found in this workspace." };
  }
  return { error: "This tool is not on GiGo's executable allowlist." };
}



async function recordUsage(env: AssistantRuntimeEnv, token: string, ownerId: string, usage: unknown, provider: string, model: string, keyId: string): Promise<void> {
  if (!isObject(usage)) return;
  const prompt = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0);
  const completion = Number(usage.completion_tokens ?? usage.output_tokens ?? 0);
  const total = Number(usage.total_tokens ?? (prompt + completion));
  if (![prompt, completion, total].every(value => Number.isFinite(value) && value >= 0)) return;
  try {
    await db(env, token, "/rest/v1/ai_usage_events", "POST", {
      user_id: ownerId, provider, model, key_id: keyId,
      prompt_tokens: Math.trunc(prompt), completion_tokens: Math.trunc(completion), total_tokens: Math.trunc(total)
    });
  } catch { /* Usage telemetry must never break an otherwise successful assistant response. */ }
}

export async function handleAssistantChat(request: Request, env: AssistantRuntimeEnv, token: string): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return response({ error: { code: "DATABASE_NOT_CONFIGURED", message: "GiGo storage is not configured." } }, 503);
  if (!providerPoolStatus(env).configured) {
    return response({ error: { code: "AI_NOT_CONFIGURED", message: "GiGo has no eligible free AI provider configured. Add AI_PROVIDER_POOL as a Cloudflare Worker secret, or use the legacy single-provider settings." } }, 503);
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

    const insertedUserRows = await db(env, token, "/rest/v1/assistant_messages?select=id", "POST", { user_id: ownerId, conversation_id: conversationId, role: "user", content: userMessage, metadata: {} }) as Row[];
    const currentMessageId = typeof insertedUserRows?.[0]?.id === "string" ? insertedUserRows[0].id : undefined;
    const [history, memory] = await Promise.all([
      db(env, token, `/rest/v1/assistant_messages?select=role,content&conversation_id=eq.${encodeURIComponent(conversationId!)}&order=created_at.desc&limit=24`),
      db(env, token, "/rest/v1/memory_items?select=id,category,content,source,confidence,updated_at&is_active=eq.true&order=updated_at.desc&limit=100")
    ]) as [Row[], Row[]];

    const capabilities = getAssistantCapabilities();
    const available = capabilities.modules.flatMap((module: { name: string; tools: { id: string; state: string; description: string }[] }) =>
      module.tools.filter(tool => tool.state === "available").map(tool => ({ id: tool.id, description: tool.description })));
    const system = [
      "You are GiGo, the user's private personal AI assistant and business operating system.",
      "Be practical, honest and clear. Never claim an action was completed unless an executable tool returned confirmation.",
      "Write in a natural, warm, intelligent conversational style, like a helpful general-purpose ChatGPT assistant. Match the user's tone and level of detail without pretending to be another product or model.",
      "Default to clear prose in short, readable paragraphs. Do not start every sentence or response with bullet symbols, asterisks, hyphens, or decorative markers.",
      "Avoid unnecessary headings, all-caps labels, bold text, emojis, and excessive formatting. Use headings only for genuinely long or multi-part answers.",
      "Use numbered steps when the user needs instructions or a sequence. Use bullets only when listing distinct items makes the answer easier to understand. Use tables only when they materially improve comparison.",
      "Answer the actual question directly first. Be concise for simple questions and thorough for complex requests. Explain unfamiliar terms plainly and give useful examples when needed.",
      "For completed actions, state what happened naturally and accurately. Do not add boilerplate summaries or repetitive closing offers to every response.",
      "You may use the tools provided to read or change the user's own projects, tasks, saved conversations, messages and memory. Use them when the user asks you to inspect, create or update those records.",
      "Memory categories should be specific and stable, such as project, preference, decision, workflow or instruction. Search before creating a memory; avoid duplicates. Update a memory only when the user explicitly asks for a correction or change.\n" +
      "Long-term memory is consent-based: create a memory only when the user explicitly asks you to remember, save, or store something. Do not infer permission from ordinary conversation or from a request to summarize.",
      "Never save passwords, API keys, access tokens, financial account credentials, or highly sensitive personal information to memory, even if asked; explain that such secrets should remain in a secure password manager or secret store.",
      "Do not create extra conversations or add duplicate messages unless the user explicitly requests that action. Normal chat turns are already saved automatically.",
      "Only confirm a memory, conversation, or message was saved after the matching tool returns a successful created/archived result. If the tool returns an error, report the failure plainly.",
      "Never invent tool results. Ask a concise clarifying question when required arguments are missing. Never attempt external actions such as sending email, publishing, spending money or signing agreements; those capabilities are not executable.",
      "GiGo's research, product, creator partnership, lead, offer, marketing, outreach, launch, commerce, creative, customer support, analytics and learning modules are not yet executable.",
      "Currently executable capability registry: " + JSON.stringify(available),
      "Relevant saved user memory candidates (ranked against this message; use only directly relevant facts): " + JSON.stringify((Array.isArray(memory) ? memory : []).map((row: Row) => { const terms = [...new Set(userMessage.toLowerCase().split(/[^a-z0-9]+/).filter(term => term.length > 2))]; const haystack = (String(row.category ?? "") + " " + String(row.content ?? "")).toLowerCase(); return { row, score: terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0) }; }).filter((item: { row: Row; score: number }) => item.score > 0).sort((a: { score: number }, b: { score: number }) => b.score-a.score).slice(0, 10).map((item: { row: Row; score: number }) => ({ ...item.row, relevance: item.score }))), 
      "For memory questions, use memory_search with the user's actual query. For questions about prior discussions, use conversations_search; do not pretend saved memories contain the entire conversation history. Distinguish explicit saved memory from conversation evidence and inference.",
      "When a request needs a capability that is not available, explain the limitation and help prepare the work instead."
    ].join("\n\n");
    const messages: Row[] = [
      { role: "system", content: system },
      ...(Array.isArray(history) ? history.slice().reverse().map(row => ({ role: String(row.role), content: String(row.content) })) : [])
    ];

    let finalAnswer = "";
    let selectedProvider = "";
    let selectedModel = "";
    let selectedKeyId = "";
    for (let round = 0; round < 4; round++) {
      const modelResult = await callAIModel(env, messages, TOOL_DEFINITIONS, true);
      const modelMessage = modelResult.message;
      selectedProvider = modelResult.provider;
      selectedModel = modelResult.model;
      selectedKeyId = modelResult.keyId;
      await recordUsage(env, token, ownerId, modelResult.usage, selectedProvider, selectedModel, selectedKeyId);
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
        try { result = await executeTool(name, args, env, token, ownerId, currentMessageId); }
        catch { result = { error: "The requested workspace operation failed. No success is being reported." }; }
        const toolContent = JSON.stringify(result);
        messages.push({ role: "tool", tool_call_id: callId, content: toolContent });
        // Tool results stay in the model's transient tool-call history; they are not chat messages.
      }
    }
    if (!finalAnswer) {
      const finalResult = await callAIModel(env, messages, TOOL_DEFINITIONS, false);
      selectedProvider = finalResult.provider;
      selectedModel = finalResult.model;
      selectedKeyId = finalResult.keyId;
      await recordUsage(env, token, ownerId, finalResult.usage, selectedProvider, selectedModel, selectedKeyId);
      finalAnswer = typeof finalResult.message.content === "string" ? finalResult.message.content.trim() : "";
    }
    if (!finalAnswer) return response({ error: { code: "EMPTY_AI_RESPONSE", message: "The AI provider returned an empty response." } }, 502);
    await db(env, token, "/rest/v1/assistant_messages?select=id", "POST", { user_id: ownerId, conversation_id: conversationId, role: "assistant", content: finalAnswer, metadata: { provider: selectedProvider, model: selectedModel, key_id: selectedKeyId } });
    return response({ data: { conversation_id: conversationId, message: finalAnswer, provider: selectedProvider, model: selectedModel, key_id: selectedKeyId } });
  } catch {
    return response({ error: { code: "ASSISTANT_RUNTIME_ERROR", message: "GiGo could not complete this request. Your saved workspace data remains protected; please try again." } }, 502);
  }
}
