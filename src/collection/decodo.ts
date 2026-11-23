import type { CollectionAdapter, CollectionExecutionContext } from "./types";

const API_BASE = "https://data.decodo.com/v1";
const MAX_CONTENT_CHARS = 60000;

function safePublicHttpsUrl(value: string): URL {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")
    || !host.includes(".") || host === "localhost" || host.endsWith(".localhost")
    || host.endsWith(".local") || host.endsWith(".internal")
    || /^[0-9.]+$/.test(host) || host.includes(":")) {
    throw new Error("Decodo accepts only public HTTPS URLs.");
  }
  return url;
}

function plainText(html: string): string {
  return html.replace(/<(script|style|noscript|svg|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'").replace(/\s+/g, " ").trim().slice(0, MAX_CONTENT_CHARS);
}

function metadata(html: string, url: string) {
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, " ").trim() ?? null;
  const description = html.match(/<meta\b[^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']*)["']/i)?.[1] ?? null;
  const canonical = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1] ?? null;
  let canonicalUrl: string | null = null;
  if (canonical) { try { canonicalUrl = new URL(canonical, url).toString(); } catch {} }
  return { title, description, canonical_url: canonicalUrl };
}

export async function decodoRequest(apiKey: string, endpoint: "scrape" | "search" | "map" | "crawl", payload: Record<string, unknown>, fetcher: typeof fetch = fetch) {
  if (!apiKey || apiKey.length > 512) throw new Error("Decodo API key is not configured.");
  const response = await fetcher(`${API_BASE}/${endpoint}`, {
    method: "POST",
    headers: { accept: "application/json", authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(25000)
  });
  if (response.status === 429) throw new Error("Decodo rate limit reached; retry later.");
  if (!response.ok) throw new Error(`Decodo request failed with HTTP ${response.status}.`);
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Decodo returned an invalid response.");
  return body as Record<string, unknown>;
}

export function createDecodoAdapter(apiKey: string, fetcher: typeof fetch = fetch): CollectionAdapter {
  return {
    key: "decodo",
    executionModes: ["batch_runner", "external_api"],
    supports: (capabilities) => capabilities.every((capability) => capability === "web_fetch"),
    async execute(_actor, input, context: CollectionExecutionContext) {
      const urls = (input.urls as string[]).slice(0, Number(input.max_pages ?? 5));
      const completed = new Set(Array.isArray(context.checkpoint?.completed_urls) ? context.checkpoint.completed_urls as string[] : []);
      let pages = Number(context.checkpoint?.pages ?? 0);
      let requests = Number(context.checkpoint?.requests ?? 0);
      let items = 0;
      let blocked = 0;
      for (const suppliedUrl of urls) {
        if (context.signal.aborted) throw new Error("Collection cancelled.");
        if (completed.has(suppliedUrl)) continue;
        const url = safePublicHttpsUrl(suppliedUrl);
        const result = await decodoRequest(apiKey, "scrape", { url: url.toString(), headless: "html" }, fetcher);
        requests++;
        const results = Array.isArray(result.results) ? result.results as Record<string, unknown>[] : [];
        const first = results[0];
        const html = typeof first?.content === "string" ? first.content : "";
        const status = Number(first?.status_code ?? 0);
        if (!first || status < 200 || status >= 300 || !html) {
          blocked++;
          completed.add(suppliedUrl);
          await context.reportProgress({ pages, items, requests, checkpoint: { completed_urls: [...completed], pages, requests, blocked } });
          continue;
        }
        const finalUrl = typeof first.url === "string" ? first.url : url.toString();
        const content = plainText(html);
        const info = metadata(html, finalUrl);
        const itemKey = await hashUrl(finalUrl);
        await context.emitItem({
          itemKey, sourceUrl: finalUrl, sourcePlatform: "web", sourceType: "web_page",
          observedAt: new Date().toISOString(), accessMethod: "decodo_web_data_api",
          permissionContext: { public_url: true, authentication: false, owner_authorized: true, provider: "decodo" },
          record: { url: finalUrl, ...info, content_excerpt: content, http_status: status, provider: "decodo" }
        });
        pages++; items++; completed.add(suppliedUrl);
        await context.reportProgress({ pages, items, requests, checkpoint: { completed_urls: [...completed], pages, requests, blocked } });
      }
      return { status: blocked ? "partial" : "completed", counters: { pages, items, requests }, checkpoint: { completed_urls: [...completed], pages, requests, blocked } };
    }
  };
}

async function hashUrl(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
