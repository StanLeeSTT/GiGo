import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const migration = await readFile(new URL("../supabase/migrations/0015_collection_provider_health.sql", import.meta.url), "utf8");
const store = await readFile(new URL("../src/collection/store.ts", import.meta.url), "utf8");
const worker = await readFile(new URL("../scripts/collection-batch-worker.mjs", import.meta.url), "utf8");
test("health RPCs are service-role only and require fixed check version", () => {
  assert.match(migration, /gigo_collection_worker_health/);
  assert.match(migration, /revoke all on function public\.gigo_collection_worker_health\(\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.gigo_collection_worker_health\(\) to service_role/i);
  assert.match(migration, /p_check_version is distinct from 'safe-http-batch-v1'/i);
  assert.match(migration, /grant execute on function public\.gigo_set_collection_provider_health\(uuid, text\) to service_role/i);
});
test("store exposes health verification and provider promotion", () => {
  assert.match(store, /healthCheck\(\): Promise<string>/);
  assert.match(store, /promoteSafeHttpProvider\(providerId: string\): Promise<boolean>/);
  assert.match(store, /gigo_set_collection_provider_health/);
});
test("health mode is a separate zero-claim operation", () => {
  assert.match(worker, /--health-check/);
  assert.match(worker, /runHealthCheck/);
  assert.match(worker, /jobs_claimed: 0/);
});
