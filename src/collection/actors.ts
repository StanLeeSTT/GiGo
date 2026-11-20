import type { CollectionActorDefinition } from "./types";

export interface PublicPageInput {
  urls: string[];
  max_pages?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Conservative input gate only. This is not a complete SSRF defence:
 * adapters must still enforce DNS/IP egress restrictions and re-check redirects.
 */
function isPermittedPublicUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 12 || value.length > 2048) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^\\[|\\]$/g, "");
    if (url.protocol !== "https:" || url.username || url.password) return false;
    if (url.port && url.port !== "443") return false;
    if (!host.includes(".") || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
    // Until an adapter has a verified DNS/IP egress guard, reject IP literals entirely.
    if (/^[0-9.]+$/.test(host) || host.includes(":")) return false;
    if (host.split(".").some((label) => !label || label.length > 63 || label.startsWith("-") || label.endsWith("-"))) return false;
    return true;
  } catch {
    return false;
  }
}

export const collectionActors: readonly CollectionActorDefinition[] = [
  {
    key: "public_page_metadata",
    version: 1,
    name: "Public Page Metadata",
    description: "Collects basic metadata from explicitly supplied public web pages where access is permitted. Does not log in, bypass controls or collect private data.",
    category: "web_crawl",
    requiredCapabilities: ["web_fetch"],
    policyTags: ["public_web_only", "robots_and_terms_required", "no_authentication", "no_private_data"],
    inputSchema: {
      type: "object",
      properties: {
        urls: { type: "array", minItems: 1, maxItems: 10, items: { type: "string", format: "uri", maxLength: 2048 } },
        max_pages: { type: "integer", minimum: 1, maximum: 10, default: 5 }
      },
      required: ["urls"],
      additionalProperties: false
    },
    outputSchema: {
      type: "object",
      properties: {
        url: { type: "string" }, title: { type: ["string", "null"] },
        description: { type: ["string", "null"] }, canonical_url: { type: ["string", "null"] }
      },
      required: ["url"]
    },
    maxItems: 10,
    maxDurationMs: 30000,
    validateInput(value: unknown): value is PublicPageInput {
      if (!isRecord(value) || Object.keys(value).some((key) => !["urls", "max_pages"].includes(key))) return false;
      if (!Array.isArray(value.urls) || value.urls.length < 1 || value.urls.length > 10) return false;
      if (value.urls.some((url) => !isPermittedPublicUrl(url))) return false;
      if (new Set(value.urls.map((url) => {
        try { return new URL(url).href; } catch { return url; }
      })).size !== value.urls.length) return false;
      if (value.max_pages !== undefined && (!Number.isInteger(value.max_pages) || Number(value.max_pages) < 1 || Number(value.max_pages) > 10)) return false;
      return true;
    }
  }
];

export function listCollectionActors(): CollectionActorDefinition[] {
  return collectionActors.map((actor) => ({ ...actor }));
}

export function getCollectionActor(key: string, version?: number): CollectionActorDefinition | null {
  const actor = collectionActors.find((candidate) => candidate.key === key && (version === undefined || candidate.version === version));
  return actor ?? null;
}
