export const SAFE_HTTP_PROVIDER_KEY = "gigo_safe_http_batch";

export function buildSafeHttpProviderRegistration(userId: string) {
  return {
    user_id: userId,
    provider_key: SAFE_HTTP_PROVIDER_KEY,
    display_name: "GiGo Safe HTTP Batch",
    provider_type: "web_crawl",
    status: "configured",
    access_mode: "public_web_permitted",
    capabilities: ["web_fetch"],
    configuration: {
      execution_mode: "batch_runner",
      runner: "github_actions",
      adapter_key: SAFE_HTTP_PROVIDER_KEY,
      adapter_version: 1,
      network_policy: "public_https_only",
      authentication: "none"
    },
    quota_state: { state: "unknown", max_concurrent_runs: 1 }
  } as const;
}

export function isSafeHttpProviderRegistrationRequest(input: Record<string, unknown> | null): boolean {
  return Boolean(input && Object.keys(input).length === 1 && input.provider_key === SAFE_HTTP_PROVIDER_KEY);
}
