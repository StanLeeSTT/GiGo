import type { CollectionActorDefinition } from "./types";

export interface PublicPageInput {
  urls: string[];
  max_pages?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
      if (value.urls.some((url) => typeof url !== "string" || url.length > 2048)) return false;
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
