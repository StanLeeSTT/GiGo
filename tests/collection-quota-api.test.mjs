import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/0048_collection_provider_quota_ledger.sql", import.meta.url), "utf8");

test("collection quota API is authenticated, owner-scoped and supports read/write only", () => {
  const start = source.indexOf('if (url.pathname === "/api/v1/collection/quotas")');
  const end = source.indexOf('if (url.pathname === "/api/v1/collection/providers/register")', start);
  const route = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  for (const item of ["verifiedUserId(token, env)", "collection_provider_quota_policies", "collection_provider_usage_monthly", "user_id: userId", "monthly_request_limit", "max_cost_per_run_usd", "resolution=merge-duplicates"]) {
    assert.ok(route.includes(item), item);
  }
  assert.match(route, /request\.method !== "GET" && request\.method !== "POST"/);
  assert.match(route, /providerKey !== "apify" && providerKey !== "decodo"/);
  assert.match(route, /providerKey === "apify"/);
  assert.match(route, /providerKey === "decodo"/);
  assert.match(route, /monthlyLimit > 100000/);
  assert.match(route, /enabled && monthlyLimit < 1/);
  assert.doesNotMatch(route, /APIFY_API_TOKEN|DECODO_API_KEY|SUPABASE_SECRET_KEY/);
});

test("provider quota policies default disabled and can only be reserved by the service role under a live lease", () => {
  assert.match(migration, /enabled boolean not null default false/);
  assert.match(migration, /collection_lease_token/);
  assert.match(migration, /collection_lease_expires_at/);
  assert.match(migration, /grant execute on function public\.gigo_reserve_collection_provider_usage\(uuid,uuid,integer\) to service_role/);
  assert.match(migration, /revoke all on function public\.gigo_reserve_collection_provider_usage\(uuid,uuid,integer\) from public,anon,authenticated/);
});
