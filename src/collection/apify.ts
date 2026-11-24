import type { CollectionAdapter, CollectionExecutionContext } from "./types";

const API_BASE = "https://api.apify.com/v2";
const MAX_PAGES_PER_RUN = 10;
const MAX_RESPONSE_ITEMS = 10;
const MAX_ITEM_CHARS = 30000;
const ALLOWED_ACTOR = "apify~web-scraper";

function publicHttpsUrl(value: string): URL {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")
    || !host.includes(".") || host === "localhost" || host.endsWith(".localhost")
    || host.endsWith(".local") || host.endsWith(".internal")
    || /^[0-9.]+$/.test(host) || host.includes(":")) {
    throw new Error("Apify collection accepts only credential-free public HTTPS URLs.");
  }
  return url;
}

function boundedText(value: unknown, max = MAX_ITEM_CHARS): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export interface ApifyAdapterConfig {
  apiToken: string;
  /** Explicit per-run cap. A durable monthly quota ledger is still required before activation. */
  maxPagesPerRun?: number;
  fetcher?: typeof fetch;
}

export function createApifyAdapter(config: ApifyAdapterConfig): CollectionAdapter {
  const token = config.apiToken.trim();
  const fetcher = config.fetcher ?? fetch;
  const maxPages = Math.min(MAX_PAGES_PER_RUN, Math.max(1, Math.floor(config.maxPagesPerRun ?? 5)));
  if (!token || token.length > 512) throw new Error("APIFY_API_TOKEN is not configured.");

  return {
    key: "apify",
    executionModes: ["batch_runner", "external_api"],
    supports: capabilities => capabilities.every(capability => capability === "web_fetch"),
    async execute(_actor, input, context: CollectionExecutionContext) {
      const supplied = Array.isArray(input.urls) ? input.urls.slice(0, maxPages) as string[] : [];
      if (!supplied.length || supplied.length > MAX_PAGES_PER_RUN) throw new Error("Apify requires between 1 and 10 permitted public URLs.");
      const urls = supplied.map(value => publicHttpsUrl(value).toString());
      const completed = new Set(Array.isArray(context.checkpoint?.completed_urls) ? context.checkpoint.completed_urls as string[] : []);
      const pending = urls.filter(url => !completed.has(url));
      if (!pending.length) return { status: "completed", counters: { pages: Number(context.checkpoint?.pages ?? 0), items: 0, requests: Number(context.checkpoint?.requests ?? 0) }, checkpoint: context.checkpoint };

      if (context.signal.aborted) throw new Error("Collection cancelled.");
      const endpoint = new URL(API_BASE + "/acts/" + ALLOWED_ACTOR + "/run-sync-get-dataset-items");
      endpoint.searchParams.set("timeout", "60");
      endpoint.searchParams.set("memory", "1024");
      const response = await fetcher(endpoint.toString(), {
        method: "POST",
        headers: { authorization: "Bearer " + token, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          startUrls: pending.map(url => ({ url })),
          maxPagesPerCrawl: pending.length,
          maxCrawlDepth: 0,
          maxResultsPerCrawl: pending.length,
          saveHtml: false,
          saveMarkdown: false,
          saveScreenshots: false
        }),
        signal: AbortSignal.timeout(70000)
      });
      if (response.status === 429) throw new Error("Apify rate limit reached; retry after the provider's retry window.");
      if (response.status >= 500) throw new Error("Apify is temporarily unavailable (HTTP " + response.status + ").");
      if (!response.ok) throw new Error("Apify rejected the collection request (HTTP " + response.status + ").");
      const payload: unknown = await response.json();
      if (!Array.isArray(payload)) throw new Error("Apify returned an invalid dataset response.");

      let items = 0;
      const completedThisRun = new Set<string>();
      for (const [index, raw] of payload.slice(0, Math.min(MAX_RESPONSE_ITEMS, pending.length)).entries()) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
        const record = raw as Record<string, unknown>;
        const rawUrl = typeof record.url === "string" ? record.url : "";
        let finalUrl: string;
        try { finalUrl = publicHttpsUrl(rawUrl).toString(); } catch { continue; }
        const title = boundedText(record.pageTitle ?? record.title, 500);
        const text = boundedText(record.text ?? record.markdown);
        const itemKey = await hash(finalUrl);
        await context.emitItem({
          itemKey,
          sourceUrl: finalUrl,
          sourcePlatform: "web",
          sourceType: "web_page",
          observedAt: new Date().toISOString(),
          accessMethod: "apify_web_scraper_actor",
          permissionContext: { provider: "apify", actor: ALLOWED_ACTOR, public_url: true, authentication: false, owner_authorized: true, site_access_policy_review_required: true },
          record: { url: finalUrl, title: title || null, content_excerpt: text, provider: "apify" }
        });
        items++;
        completedThisRun.add(pending[index]);
      }
      const nextCompleted = [...new Set([...completed, ...completedThisRun])];
      const pages = Number(context.checkpoint?.pages ?? 0) + items;
      const requests = Number(context.checkpoint?.requests ?? 0) + 1;
      const checkpoint = { completed_urls: nextCompleted, pages, requests };
      await context.reportProgress({ pages, items, requests, checkpoint });
      return { status: items < pending.length ? "partial" : "completed", counters: { pages, items, requests }, checkpoint };
    }
  };
}
