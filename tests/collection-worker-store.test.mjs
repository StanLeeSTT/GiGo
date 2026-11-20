import test from "node:test";
import assert from "node:assert/strict";
import { createCollectionWorkerStore } from "../src/collection/store.ts";

const item = {
  itemKey: "example",
  sourceUrl: "https://example.com/",
  sourcePlatform: "web",
  sourceType: "web",
  observedAt: "2026-11-20T10:00:00.000Z",
  accessMethod: "public_web_permitted",
  permissionContext: { robots_checked: true },
  record: { title: "Example" }
};

test("worker store uses Supabase secret key as apikey without a Bearer header", async () => {
  const calls = [];
  const store = createCollectionWorkerStore({
    supabaseUrl: "https://project.supabase.co/",
    serviceKey: "sb_secret_example",
    fetcher: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify([]), { status: 200 });
    }
  });

  assert.deepEqual(await store.claim(2, 180), []);
  assert.equal(calls[0].url, "https://project.supabase.co/rest/v1/rpc/gigo_claim_collection_jobs");
  assert.equal(calls[0].init.headers.apikey, "sb_secret_example");
  assert.equal("authorization" in calls[0].init.headers, false);
  assert.deepEqual(JSON.parse(calls[0].init.body), { p_limit: 2, p_lease_seconds: 180 });
});

test("worker store calls persistence lifecycle RPCs with the lease token", async () => {
  const calls = [];
  const responses = [true, "inserted", true, true];
  const store = createCollectionWorkerStore({
    supabaseUrl: "https://project.supabase.co",
    serviceKey: "sb_secret_example",
    fetcher: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(responses.shift()), { status: 200 });
    }
  });

  assert.equal(await store.progress("job-1", "lease-1", { pages: 1, items: 1, requests: 2 }, { cursor: "next" }), true);
  assert.equal(await store.persistItem("job-1", "lease-1", item), "inserted");
  assert.equal(await store.finish("job-1", "lease-1", "completed"), true);
  assert.equal(await store.retry("job-1", "lease-1", { message: "temporary" }, 60), true);
  assert.equal(calls.length, 4);
  assert.ok(calls.every((call) => call.init.headers.apikey === "sb_secret_example"));
  assert.ok(calls.every((call) => !("authorization" in call.init.headers)));
  assert.equal(calls[1].url.endsWith("/gigo_collection_worker_item"), true);
  const itemBody = JSON.parse(calls[1].init.body);
  assert.equal(itemBody.p_item.itemKey, "example");
  assert.deepEqual(itemBody.p_item.permissionContext, { robots_checked: true });
});

test("worker store distinguishes a lost lease from a duplicate dataset item", async () => {
  const results = ["duplicate", "lease_lost"];
  const store = createCollectionWorkerStore({
    supabaseUrl: "https://project.supabase.co",
    serviceKey: "sb_secret_example",
    fetcher: async () => new Response(JSON.stringify(results.shift()), { status: 200 })
  });
  assert.equal(await store.persistItem("job-1", "lease-1", item), "duplicate");
  assert.equal(await store.persistItem("job-1", "lease-1", item), "lease_lost");
});

test("legacy service-role JWT keys use the Authorization header", async () => {
  let headers;
  const store = createCollectionWorkerStore({
    supabaseUrl: "https://project.supabase.co",
    serviceKey: "legacy.jwt.key",
    fetcher: async (_url, init) => {
      headers = init.headers;
      return new Response("true", { status: 200 });
    }
  });
  await store.finish("job-1", "lease-1", "completed");
  assert.equal(headers.authorization, "Bearer legacy.jwt.key");
});

test("worker store does not expose database response bodies in errors", async () => {
  const store = createCollectionWorkerStore({
    supabaseUrl: "https://project.supabase.co",
    serviceKey: "sb_secret_example",
    fetcher: async () => new Response(JSON.stringify({ message: "sensitive database detail" }), { status: 500 })
  });
  await assert.rejects(store.claim(), /database request failed \(500\)/);
  await assert.rejects(store.claim(), (error) => !error.message.includes("sensitive database detail"));
});
