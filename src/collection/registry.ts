/**
 * GiGo Universal Collection Engine provider catalogue.
 *
 * This is a capability/verification catalogue, not an assertion that every
 * provider is connected or usable on a free plan. Runtime credentials and
 * owner configuration belong in server-side secrets / collection_providers.
 */

export type CollectionCapability =
  | "web_search"
  | "web_fetch"
  | "web_crawl"
  | "browser_automation"
  | "structured_extraction"
  | "social_discovery"
  | "social_metrics"
  | "lead_discovery"
  | "video_metadata"
  | "news_discovery";

export type ProviderVerification =
  | "internal_verified"
  | "verified_open_source"
  | "official_api"
  | "integration_scaffold"
  | "candidate_unverified";

export type ProviderExecutionMode =
  | "worker_fetch"
  | "browser_runtime"
  | "batch_runner"
  | "external_api"
  | "self_hosted";

export interface CollectionProviderDefinition {
  key: string;
  name: string;
  category: "search" | "web_crawl" | "browser" | "social_api" | "social_collection" | "data_extraction";
  verification: ProviderVerification;
  executionModes: readonly ProviderExecutionMode[];
  capabilities: readonly CollectionCapability[];
  platforms: readonly string[];
  freeTier: "unknown" | "quota_limited" | "self_hosted_software";
  defaultEnabled: false;
  notes: string;
  officialUrl?: string;
}

const providers: readonly CollectionProviderDefinition[] = [
  {
    key: "gigo_safe_http_batch",
    name: "GiGo Safe HTTP Batch",
    category: "web_crawl",
    verification: "internal_verified",
    executionModes: ["batch_runner"],
    capabilities: ["web_fetch"],
    platforms: ["web"],
    freeTier: "self_hosted_software",
    defaultEnabled: false,
    notes: "GiGo-owned bounded HTTPS metadata collector. Requires a manually dispatched trusted GitHub Actions runner and owner-configured provider record; not active by default."
  },
  {
    key: "crawlee",
    name: "Crawlee",
    category: "web_crawl",
    verification: "verified_open_source",
    executionModes: ["batch_runner", "self_hosted"],
    capabilities: ["web_fetch", "web_crawl", "structured_extraction"],
    platforms: ["web"],
    freeTier: "self_hosted_software",
    defaultEnabled: false,
    notes: "Open-source crawling framework. Compute, browser dependencies and hosting are separate costs.",
    officialUrl: "https://crawlee.dev/"
  },
  {
    key: "playwright",
    name: "Playwright",
    category: "browser",
    verification: "verified_open_source",
    executionModes: ["batch_runner", "browser_runtime", "self_hosted"],
    capabilities: ["browser_automation", "web_fetch", "structured_extraction"],
    platforms: ["web"],
    freeTier: "self_hosted_software",
    defaultEnabled: false,
    notes: "Browser automation runtime; must obey site access rules and is not a bypass mechanism.",
    officialUrl: "https://playwright.dev/"
  },
  {
    key: "crawl4ai",
    name: "Crawl4AI",
    category: "web_crawl",
    verification: "verified_open_source",
    executionModes: ["batch_runner", "self_hosted"],
    capabilities: ["web_crawl", "structured_extraction"],
    platforms: ["web"],
    freeTier: "self_hosted_software",
    defaultEnabled: false,
    notes: "AI-oriented crawling and extraction framework; requires suitable Python/browser compute.",
    officialUrl: "https://github.com/unclecode/crawl4ai"
  },
  {
    key: "searxng",
    name: "SearXNG",
    category: "search",
    verification: "verified_open_source",
    executionModes: ["self_hosted", "external_api"],
    capabilities: ["web_search", "news_discovery"],
    platforms: ["web", "news"],
    freeTier: "self_hosted_software",
    defaultEnabled: false,
    notes: "Metasearch engine. Self-hosting needs compute; public instances are untrusted and must not receive private queries.",
    officialUrl: "https://github.com/searxng/searxng"
  },
  {
    key: "apify",
    name: "Apify Web Scraper",
    category: "web_crawl",
    verification: "official_api",
    executionModes: ["batch_runner", "external_api"],
    capabilities: ["web_fetch"],
    platforms: ["web"],
    freeTier: "quota_limited",
    defaultEnabled: false,
    notes: "Fixed official Web Scraper Actor adapter. Requires an owner-enabled monthly request quota and mandatory per-run USD cap; provider health and account allowance must be verified before activation.",
    officialUrl: "https://apify.com/"
  },
  {
    key: "decodo",
    name: "Decodo Web Data API",
    category: "web_crawl",
    verification: "official_api",
    executionModes: ["batch_runner", "external_api"],
    capabilities: ["web_fetch"],
    platforms: ["web"],
    freeTier: "quota_limited",
    defaultEnabled: false,
    notes: "Official Web Data API scraper adapter. Search/map/crawl endpoints remain future work; every scrape request reserves against the durable owner monthly request ceiling.",
    officialUrl: "https://decodo.com/web-data-api"
  },
  {
    key: "maxun",
    name: "Maxun",
    category: "web_crawl",
    verification: "integration_scaffold",
    executionModes: ["self_hosted"],
    capabilities: ["web_crawl", "browser_automation", "structured_extraction"],
    platforms: ["web"],
    freeTier: "self_hosted_software",
    defaultEnabled: false,
    notes: "GiGo API/UI integration scaffold exists; Maxun itself is not deployed or connected.",
    officialUrl: "https://github.com/getmaxun/maxun"
  },
  {
    key: "youtube_data_api",
    name: "YouTube Data API",
    category: "social_api",
    verification: "official_api",
    executionModes: ["worker_fetch", "external_api"],
    capabilities: ["social_discovery", "social_metrics", "video_metadata", "lead_discovery"],
    platforms: ["youtube"],
    freeTier: "quota_limited",
    defaultEnabled: false,
    notes: "Official API with quota accounting. Captions/transcripts have separate access rules.",
    officialUrl: "https://developers.google.com/youtube/v3"
  },
  {
    key: "meta_graph_api",
    name: "Meta Graph API",
    category: "social_api",
    verification: "official_api",
    executionModes: ["worker_fetch", "external_api"],
    capabilities: ["social_discovery", "social_metrics"],
    platforms: ["facebook", "instagram"],
    freeTier: "quota_limited",
    defaultEnabled: false,
    notes: "Only approved endpoints, account types, OAuth scopes and Page permissions; not unrestricted public scraping.",
    officialUrl: "https://developers.facebook.com/docs/graph-api/"
  },
  {
    key: "insight_social",
    name: "InsightSocial",
    category: "social_api",
    verification: "candidate_unverified",
    executionModes: ["external_api"],
    capabilities: ["social_discovery", "social_metrics", "lead_discovery"],
    platforms: ["instagram", "tiktok", "youtube", "facebook", "x", "linkedin"],
    freeTier: "unknown",
    defaultEnabled: false,
    notes: "Candidate retained at the user's request. Verify current documentation, supported endpoints, recurring quota, terms, card requirements and regional availability before integration.",
    officialUrl: "https://www.insightsocial.app/"
  },
  {
    key: "socq",
    name: "SocQ",
    category: "social_collection",
    verification: "candidate_unverified",
    executionModes: ["external_api"],
    capabilities: ["social_discovery", "social_metrics", "structured_extraction"],
    platforms: ["social_platforms"],
    freeTier: "unknown",
    defaultEnabled: false,
    notes: "Candidate retained at the user's request. Verify identity, API docs, pricing, quotas, permitted use and service reliability before integration.",
    officialUrl: "https://socq.ai/"
  },
  {
    key: "arachne_sdk",
    name: "Arachne SDK",
    category: "web_crawl",
    verification: "candidate_unverified",
    executionModes: ["batch_runner", "self_hosted"],
    capabilities: ["web_crawl", "structured_extraction"],
    platforms: ["web"],
    freeTier: "unknown",
    defaultEnabled: false,
    notes: "User-requested candidate. Exact project/repository identity and maintenance status still need verification."
  },
  {
    key: "harvest_agent",
    name: "Harvest Agent",
    category: "data_extraction",
    verification: "candidate_unverified",
    executionModes: ["batch_runner", "self_hosted", "external_api"],
    capabilities: ["web_crawl", "structured_extraction", "lead_discovery"],
    platforms: ["web"],
    freeTier: "unknown",
    defaultEnabled: false,
    notes: "User-requested candidate. Exact project/repository identity and maintenance status still need verification."
  },
  {
    key: "extracto",
    name: "Extracto",
    category: "data_extraction",
    verification: "candidate_unverified",
    executionModes: ["batch_runner", "self_hosted", "external_api"],
    capabilities: ["structured_extraction"],
    platforms: ["web"],
    freeTier: "unknown",
    defaultEnabled: false,
    notes: "User-requested candidate. Exact project/repository identity and maintenance status still need verification."
  },
  {
    key: "jiro_search",
    name: "JIRO Search",
    category: "search",
    verification: "candidate_unverified",
    executionModes: ["external_api", "self_hosted"],
    capabilities: ["web_search", "news_discovery"],
    platforms: ["web", "news"],
    freeTier: "unknown",
    defaultEnabled: false,
    notes: "User-requested candidate. Exact project/repository identity and maintenance status still need verification."
  },

];

export function listCollectionProviders(): CollectionProviderDefinition[] {
  return providers.map((provider) => ({ ...provider }));
}

export function getCollectionProvider(key: string): CollectionProviderDefinition | null {
  const provider = providers.find((candidate) => candidate.key === key);
  return provider ? { ...provider } : null;
}

export function findCollectionProvidersByCapability(
  capability: CollectionCapability
): CollectionProviderDefinition[] {
  return providers
    .filter((provider) => provider.capabilities.includes(capability))
    .map((provider) => ({ ...provider }));
}

export function getCollectionProviderVerificationSummary(): Record<ProviderVerification, number> {
  return providers.reduce((summary, provider) => {
    summary[provider.verification] += 1;
    return summary;
  }, {
    internal_verified: 0,
    verified_open_source: 0,
    official_api: 0,
    integration_scaffold: 0,
    candidate_unverified: 0
  });
}
