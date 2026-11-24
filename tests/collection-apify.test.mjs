import test from "node:test";
import assert from "node:assert/strict";
import { createApifyAdapter } from "../src/collection/apify.ts";

function context() {
  const emitted = [], progress = [];
  return { emitted, progress, value: {
    userId: "owner", runId: "run", providerKey: "apify",
    signal: new AbortController().signal, deadlineAt: new Date(Date.now()+30000).toISOString(),
    checkpoint: {}, async reportProgress(value) { progress.push(value); },
    async emitItem(value) { emitted.push(value); }
  }};
}

test("Apify uses only the allow-listed official Web Scraper Actor and bearer token", async () => {
  let seen;
  const adapter = createApifyAdapter({ apiToken: "test-token", fetcher: async (url, init) => {
    seen = { url: String(url), init };
    return new Response(JSON.stringify([{ url: "https://example.com/", pageTitle: "Example", text: "Public page" }]), { status: 200 });
  }});
  const ctx = context();
  const result = await adapter.execute({}, { urls: ["https://example.com"], max_pages: 1 }, ctx.value);
  assert.match(seen.url, /\/acts\/apify~web-scraper\/run-sync-get-dataset-items/);
  assert.equal(seen.init.headers.authorization, "Bearer test-token");
  assert.equal(JSON.parse(seen.init.body).maxPagesPerCrawl, 1);
  assert.equal(result.counters.items, 1);
  assert.equal(ctx.emitted[0].record.title, "Example");
  assert.equal(ctx.emitted[0].permissionContext.provider, "apify");
});

test("Apify rejects private or non-HTTPS URLs before calling the provider", async () => {
  let calls = 0;
  const adapter = createApifyAdapter({ apiToken: "test-token", fetcher: async () => { calls++; return new Response("[]"); } });
  const ctx = context();
  await assert.rejects(() => adapter.execute({}, { urls: ["http://example.com"], max_pages: 1 }, ctx.value), /public HTTPS/i);
  assert.equal(calls, 0);
});

test("Apify keeps missing dataset URLs retryable instead of marking them complete", async () => {
  const adapter = createApifyAdapter({ apiToken: "test-token", fetcher: async () =>
    new Response(JSON.stringify([{ url: "https://example.com/", pageTitle: "Example", text: "ok" }]), { status: 200 })
  });
  const ctx = context();
  const result = await adapter.execute({}, { urls: ["https://example.com", "https://example.org"], max_pages: 2 }, ctx.value);
  assert.equal(result.status, "partial");
  assert.equal(result.checkpoint.completed_urls.length, 1);
});

test("Apify provider rate limits are reported without exposing response bodies", async () => {
  const adapter = createApifyAdapter({ apiToken: "test-token", fetcher: async () => new Response("private details", { status: 429 }) });
  const ctx = context();
  await assert.rejects(() => adapter.execute({}, { urls: ["https://example.com"], max_pages: 1 }, ctx.value), /rate limit/i);
});
