import test from "node:test";
import assert from "node:assert/strict";
import { createApifyAdapter } from "../src/collection/apify.ts";

function context() {
  const emitted = [];
  const progress = [];
  return {
    emitted,
    progress,
    value: {
      userId: "owner",
      runId: "run",
      providerKey: "apify",
      signal: new AbortController().signal,
      deadlineAt: new Date(Date.now() + 60000).toISOString(),
      checkpoint: {},
      async reserveProviderUsage() { return { maxCostPerRunUsd: 0.025 }; },
      async reportProgress(value) { progress.push(value); },
      async emitItem(value) { emitted.push(value); }
    }
  };
}

test("Apify adapter uses a fixed Actor, bounded inputs and bearer authentication", async () => {
  let calledUrl = "";
  let calledInit;
  const mock = async (url, init) => {
    calledUrl = String(url);
    calledInit = init;
    return new Response(JSON.stringify([{ url: "https://example.com/page", pageTitle: "Example", text: "Public page" }]), { status: 200 });
  };
  const adapter = createApifyAdapter({ apiToken: "test-token", fetcher: mock });
  const state = context();
  const result = await adapter.execute({}, { urls: ["https://example.com/page"], max_pages: 1 }, state.value);
  assert.equal(new URL(calledUrl).pathname, "/v2/acts/apify~web-scraper/run-sync-get-dataset-items");
  assert.equal(new URL(calledUrl).searchParams.get("maxTotalChargeUsd"), "0.0250");
  assert.equal(new URL(calledUrl).searchParams.get("maxItems"), "1");
  assert.equal(calledInit.headers.authorization, "Bearer test-token");
  assert.equal(JSON.parse(calledInit.body).maxPagesPerCrawl, 1);
  assert.equal(result.status, "completed");
  assert.equal(state.emitted.length, 1);
  assert.equal(state.emitted[0].permissionContext.provider, "apify");
});

test("Apify adapter rejects private and non-HTTPS destinations before provider access", async () => {
  let calls = 0;
  const adapter = createApifyAdapter({ apiToken: "test-token", fetcher: async () => { calls++; return new Response("[]"); } });
  const state = context();
  await assert.rejects(() => adapter.execute({}, { urls: ["http://127.0.0.1/admin"] }, state.value));
  await assert.rejects(() => adapter.execute({}, { urls: ["https://localhost/admin"] }, state.value));
  assert.equal(calls, 0);
});

test("Apify adapter resumes only URLs represented by returned dataset items", async () => {
  const adapter = createApifyAdapter({
    apiToken: "test-token",
    fetcher: async () => new Response(JSON.stringify([{ url: "https://example.com/one", text: "one" }]), { status: 200 })
  });
  const state = context();
  const result = await adapter.execute({}, { urls: ["https://example.com/one", "https://example.com/two"] }, state.value);
  assert.equal(result.status, "partial");
  assert.deepEqual(result.checkpoint.completed_urls, ["https://example.com/one"]);
});

test("Apify checkpoints the returned URL rather than assuming dataset order", async () => {
  const adapter = createApifyAdapter({
    apiToken: "test-token",
    fetcher: async () => new Response(JSON.stringify([{ url: "https://example.com/two", text: "two" }]), { status: 200 })
  });
  const state = context();
  const result = await adapter.execute({}, { urls: ["https://example.com/one", "https://example.com/two"] }, state.value);
  assert.equal(result.status, "partial");
  assert.deepEqual(result.checkpoint.completed_urls, ["https://example.com/two"]);
});

test("Apify ignores malformed checkpoint entries and rejects non-string URLs", async () => {
  const adapter = createApifyAdapter({
    apiToken: "test-token",
    fetcher: async () => new Response(JSON.stringify([{ url: "https://example.com/page", text: "ok" }]), { status: 200 })
  });
  const state = context();
  state.value.checkpoint = { completed_urls: [null, "not a URL", "https://example.com/other"] };
  const result = await adapter.execute({}, { urls: ["https://example.com/page"] }, state.value);
  assert.equal(result.status, "completed");
  await assert.rejects(() => adapter.execute({}, { urls: [{}] }, context().value));
});

test("Apify refuses to call the provider without a quota-derived per-run USD cap", async () => {
  let calls = 0;
  const adapter = createApifyAdapter({ apiToken: "test-token", fetcher: async () => { calls++; return new Response("[]"); } });
  const state = context();
  state.value.reserveProviderUsage = async () => ({ maxCostPerRunUsd: null });
  await assert.rejects(() => adapter.execute({}, { urls: ["https://example.com/page"] }, state.value), /per-run USD ceiling/i);
  assert.equal(calls, 0);
});
