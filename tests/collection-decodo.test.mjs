import test from "node:test";
import assert from "node:assert/strict";
import { createDecodoAdapter, decodoRequest } from "../src/collection/decodo.ts";

test("Decodo client uses the official bearer-authenticated Web Data API", async () => {
  let seen;
  const result = await decodoRequest("test-key", "scrape", { url: "https://example.com" }, async (url, init) => {
    seen = { url, init };
    return new Response(JSON.stringify({ results: [{ content: "<title>Example</title>", status_code: 200 }] }), { status: 200 });
  });
  assert.equal(seen.url, "https://data.decodo.com/v1/scrape");
  assert.equal(seen.init.headers.authorization, "Bearer test-key");
  assert.equal(result.results.length, 1);
});

test("Decodo adapter persists bounded public-page evidence", async () => {
  const emitted = [], progress = [];
  const adapter = createDecodoAdapter("test-key", async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.headless, "html");
    return new Response(JSON.stringify({ results: [{ content: "<html><title>Example</title><meta name='description' content='A test'><body>Useful page content</body></html>", status_code: 200 }] }), { status: 200 });
  });
  const result = await adapter.execute({}, { urls: ["https://example.com"], max_pages: 1 }, {
    userId: "owner", runId: "run", providerKey: "decodo", signal: new AbortController().signal,
    deadlineAt: new Date(Date.now()+30000).toISOString(), checkpoint: {},
    async reserveProviderUsage() { return { maxCostPerRunUsd: null }; },
    async reportProgress(v) { progress.push(v); }, async emitItem(v) { emitted.push(v); }
  });
  assert.equal(result.counters.requests, 1);
  assert.equal(result.counters.items, 1);
  assert.equal(emitted[0].record.title, "Example");
  assert.match(emitted[0].record.content_excerpt, /Useful page content/);
  assert.equal(progress.length, 1);
});

test("Decodo rejects non-public URL schemes and hosts before any API request", async () => {
  let calls = 0;
  const adapter = createDecodoAdapter("test-key", async () => { calls++; return new Response("{}", {status:200}); });
  await assert.rejects(() => adapter.execute({}, { urls: ["http://example.com"] }, {
    userId:"owner",runId:"run",providerKey:"decodo",signal:new AbortController().signal,
    deadlineAt:new Date().toISOString(),checkpoint:{},async reserveProviderUsage(){return {maxCostPerRunUsd:null};},async reportProgress(){},async emitItem(){}
  }));
  assert.equal(calls,0);
});

test("Decodo rate limits are surfaced as retryable errors", async () => {
  await assert.rejects(() => decodoRequest("test-key","scrape",{url:"https://example.com"},async () => new Response("{}",{status:429})), /rate limit/i);
});

test("Decodo reserves monthly request quota before making the external call", async () => {
  let reserved = 0, called = 0;
  const adapter = createDecodoAdapter("test-key", async () => { called++; return new Response(JSON.stringify({ results: [] }), { status: 200 }); });
  const state = {
    userId:"owner",runId:"run",providerKey:"decodo",signal:new AbortController().signal,
    deadlineAt:new Date().toISOString(),checkpoint:{},
    async reserveProviderUsage(units) { reserved += units; return { maxCostPerRunUsd:null }; },
    async reportProgress(){},async emitItem(){}
  };
  await adapter.execute({}, { urls:["https://example.com"], max_pages:1 }, state);
  assert.equal(reserved, 1);
  assert.equal(called, 1);
});

test("Decodo fails closed when monthly quota cannot be reserved", async () => {
  let called = 0;
  const adapter = createDecodoAdapter("test-key", async () => { called++; return new Response("{}", { status:200 }); });
  await assert.rejects(() => adapter.execute({}, { urls:["https://example.com"] }, {
    userId:"owner",runId:"run",providerKey:"decodo",signal:new AbortController().signal,
    deadlineAt:new Date().toISOString(),checkpoint:{},
    async reserveProviderUsage(){ throw new Error("quota exhausted"); },
    async reportProgress(){},async emitItem(){}
  }), /quota exhausted/);
  assert.equal(called, 0);
});
