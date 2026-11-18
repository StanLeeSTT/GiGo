export interface ProviderEnv {
  AI_PROVIDER_POOL?: string;
  AI_API_BASE_URL?: string;
  AI_API_KEY?: string;
  AI_MODEL?: string;
}
export interface ProviderResult { message: Record<string, unknown>; provider: string; model: string; usage?: unknown }
type PoolEntry = { provider: string; keyId?: string; baseUrl: string; apiKey: string; model: string; enabled?: boolean; freeOnly?: boolean; priority?: number };
function pool(env: ProviderEnv): PoolEntry[] {
  if (env.AI_PROVIDER_POOL) {
    let parsed: unknown;
    try { parsed = JSON.parse(env.AI_PROVIDER_POOL); } catch { throw new Error("AI provider pool configuration is invalid JSON."); }
    if (!Array.isArray(parsed)) throw new Error("AI provider pool must be a JSON array.");
    return parsed.filter((item): item is PoolEntry => Boolean(item) && typeof item === "object" &&
      (item as PoolEntry).enabled !== false && (item as PoolEntry).freeOnly === true &&
      typeof (item as PoolEntry).provider === "string" && typeof (item as PoolEntry).baseUrl === "string" &&
      typeof (item as PoolEntry).apiKey === "string" && typeof (item as PoolEntry).model === "string" &&
      (item as PoolEntry).apiKey.length > 10 && (item as PoolEntry).model.length > 0)
      .sort((a,b)=>(a.priority ?? 100)-(b.priority ?? 100));
  }
  if (env.AI_API_BASE_URL && env.AI_API_KEY && env.AI_MODEL) {
    return [{ provider: "legacy", baseUrl: env.AI_API_BASE_URL, apiKey: env.AI_API_KEY, model: env.AI_MODEL, freeOnly: true }];
  }
  return [];
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
        const result = await fetch(endpoint(key.baseUrl), {
          method: "POST",
          headers: { authorization: `Bearer ${key.apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ model: key.model, messages, temperature: 0.3, ...(withTools ? { tools, tool_choice: "auto" } : {}) })
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
        return { message, provider: entry.provider, model: key.model, usage: payload.usage };
      } catch {
        lastError = `Provider ${entry.provider} could not be reached.`;
      }
    }
  }
  throw new Error(lastError);
}
export function providerPoolStatus(env: ProviderEnv): { configured: boolean; providers: { provider: string; key_count: number; models: string[] }[] } {
  const entries = pool(env);
  const grouped = new Map<string, PoolEntry[]>();
  for (const entry of entries) grouped.set(entry.provider, [...(grouped.get(entry.provider) ?? []), entry]);
  return { configured: entries.length > 0, providers: [...grouped.entries()].map(([provider, keys]) => ({ provider, key_count: keys.length, models: [...new Set(keys.map(key => key.model))] })) };
}
