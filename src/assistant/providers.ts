export interface ProviderEnv {
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
export interface ProviderResult { message: Record<string, unknown>; provider: string; model: string; keyId: string; usage?: unknown }
type PoolEntry = { provider: string; keyId?: string; baseUrl: string; apiKey: string; model: string; enabled?: boolean; freeOnly?: boolean; priority?: number };
function pool(env: ProviderEnv): PoolEntry[] {
  let configured: unknown[] = [];
  if (env.AI_PROVIDER_POOL) {
    let parsed: unknown;
    try {
      // Accept a UTF-8 BOM and accidental surrounding whitespace, but require plain JSON
      // (not Markdown fences, comments, or JavaScript object syntax).
      const source = env.AI_PROVIDER_POOL.replace(/^\uFEFF/, "").trim();
      parsed = JSON.parse(source);
    } catch (error) {
      const source = env.AI_PROVIDER_POOL.replace(/^\uFEFF/, "").trim();
      const detail = error instanceof Error ? error.message : "";
      const match = detail.match(/position (\d+)/i);
      if (match) {
        const position = Math.min(Number(match[1]), source.length);
        const before = source.slice(0, position);
        const line = before.split("\n").length;
        const column = position - before.lastIndexOf("\n");
        throw new Error(`AI_PROVIDER_POOL is not valid JSON (line ${line}, column ${column}). Check for a missing comma, extra comma, unescaped quote, or Markdown code fence. Do not share the secret value.`);
      }
      throw new Error("AI_PROVIDER_POOL is not valid JSON. Paste only the raw JSON array, beginning with [ and ending with ], without Markdown fences.");
    }
    if (!Array.isArray(parsed)) throw new Error("AI provider pool must be a JSON array.");
    configured = parsed;
  }
  const entries = configured.filter((item): item is PoolEntry => Boolean(item) && typeof item === "object" &&
    (item as PoolEntry).enabled !== false && (item as PoolEntry).freeOnly === true &&
    typeof (item as PoolEntry).provider === "string" && typeof (item as PoolEntry).baseUrl === "string" &&
    typeof (item as PoolEntry).apiKey === "string" && (item as PoolEntry).apiKey.length > 10 &&
    typeof (item as PoolEntry).model === "string" && (item as PoolEntry).model.length > 0);

  // Dedicated bindings let the owner add these two providers without editing or replacing
  // the existing AI_PROVIDER_POOL JSON secret. Credentials remain server-side.
  if (env.NVIDIA_NIM_API_KEY && env.NVIDIA_NIM_API_KEY.length > 10) {
    entries.push({
      provider: "nvidia-nim",
      keyId: "nvidia-nemotron-ultra-main",
      baseUrl: "https://integrate.api.nvidia.com/v1",
      apiKey: env.NVIDIA_NIM_API_KEY,
      model: env.NVIDIA_NIM_MODEL || "nvidia/nemotron-3-ultra-550b-a55b",
      freeOnly: true,
      enabled: true,
      priority: 20
    });
  }
  if (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_AI_TOKEN && env.CLOUDFLARE_AI_TOKEN.length > 10) {
    entries.push({
      provider: "cloudflare-workers-ai",
      keyId: "cloudflare-workers-ai-main",
      baseUrl: `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)}/ai/v1`,
      apiKey: env.CLOUDFLARE_AI_TOKEN,
      model: env.CLOUDFLARE_AI_MODEL || "@cf/zai-org/glm-4.7-flash",
      freeOnly: true,
      enabled: true,
      priority: 15
    });
  }
  if (!env.AI_PROVIDER_POOL && !entries.length && env.AI_API_BASE_URL && env.AI_API_KEY && env.AI_MODEL) {
    entries.push({ provider: "legacy", baseUrl: env.AI_API_BASE_URL, apiKey: env.AI_API_KEY, model: env.AI_MODEL, freeOnly: true });
  }
  return entries.sort((a,b)=>(a.priority ?? 100)-(b.priority ?? 100));
}
const providerCooldown = new Map<string, number>();
function endpoint(base: string): string {
  const clean = base.replace(/\/+$/, "");
  return clean.endsWith("/chat/completions") ? clean : clean + "/chat/completions";
}
export async function callAIModel(env: ProviderEnv, messages: Record<string, unknown>[], tools: unknown[], withTools: boolean): Promise<ProviderResult> {
  const entries = pool(env);
  if (!entries.length) throw new Error("No eligible free AI provider is configured.");
  const now = Date.now();
  const eligible = entries.filter(entry => (providerCooldown.get(entry.provider) ?? 0) <= now);
  const triedProviders = new Set<string>();
  let lastError = "No eligible AI provider is available.";
  for (const entry of eligible) {
    if (triedProviders.has(entry.provider)) continue;
    triedProviders.add(entry.provider);
    const sameProvider = eligible.filter(candidate => candidate.provider === entry.provider);
    for (const key of sameProvider) {
      try {
        const body: Record<string, unknown> = {
          model: key.model,
          messages,
          temperature: key.provider === "nvidia-nim" ? 1 : 0.3,
          stream: false,
          ...(key.provider === "nvidia-nim" ? { top_p: 0.95, max_tokens: 4096, chat_template_kwargs: { enable_thinking: true, force_nonempty_content: true } } : {}),
          ...(withTools ? { tools, tool_choice: "auto" } : {})
        };
        const result = await fetch(endpoint(key.baseUrl), {
          method: "POST",
          headers: { authorization: `Bearer ${key.apiKey}`, "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify(body)
        });
        const payload = await result.json().catch(() => ({})) as Record<string, unknown>;
        if (result.status === 429) {
          providerCooldown.set(entry.provider, Date.now() + 60_000);
          lastError = `Provider ${entry.provider} rate-limited this request; GiGo will not rotate keys to bypass that limit.`;
          break;
        }
        if (result.status === 401 || result.status === 403) { lastError = `An authorised key for ${entry.provider} was rejected.`; continue; }
        if (!result.ok) {
          lastError = `Provider ${entry.provider} returned HTTP ${result.status}.`;
          if (result.status >= 500) continue;
          break;
        }
        const choices = payload.choices as Record<string, unknown>[] | undefined;
        const message = choices?.[0]?.message as Record<string, unknown> | undefined;
        if (!message) { lastError = `Provider ${entry.provider} returned an invalid chat response.`; break; }
        return { message, provider: entry.provider, model: key.model, keyId: key.keyId ?? "default", usage: payload.usage };
      } catch {
        lastError = `Provider ${entry.provider} could not be reached.`;
      }
    }
  }
  throw new Error(lastError);
}
export function providerPoolStatus(env: ProviderEnv): { configured: boolean; providers: { provider: string; key_count: number; key_ids: string[]; models: string[] }[] } {
  const entries = pool(env);
  const grouped = new Map<string, PoolEntry[]>();
  for (const entry of entries) grouped.set(entry.provider, [...(grouped.get(entry.provider) ?? []), entry]);
  return { configured: entries.length > 0, providers: [...grouped.entries()].map(([provider, keys]) => ({ provider, key_count: keys.length, key_ids: keys.map(key => key.keyId ?? "default"), models: [...new Set(keys.map(key => key.model))] })) };
}
