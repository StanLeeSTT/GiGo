import test from "node:test";
import assert from "node:assert/strict";
import { getCollectionActor } from "../src/collection/actors.ts";
import { planCollectionProviders } from "../src/collection/planner.ts";
import { listCollectionProviders } from "../src/collection/registry.ts";

const actor = getCollectionActor("public_page_metadata");
assert.ok(actor, "public_page_metadata actor must be registered");

test("public page actor accepts a bounded HTTPS URL list", () => {
  assert.equal(actor.validateInput({ urls: ["https://example.com"] }), true);
  assert.equal(actor.validateInput({ urls: ["https://example.com", "https://www.example.org"], max_pages: 10 }), true);
});

test("public page actor rejects unsafe or malformed URL inputs", () => {
  for (const input of [
    null,
    {},
    { urls: [] },
    { urls: ["http://example.com"] },
    { urls: ["https://user:pass@example.com"] },
    { urls: ["https://localhost"] },
    { urls: ["https://service.local"] },
    { urls: ["https://127.0.0.1"] },
    { urls: ["https://[::1]"] },
    { urls: ["https://example.com:8443"] },
    { urls: ["https://example.com", "https://example.com/"] },
    { urls: ["https://example.com"], max_pages: 11 },
    { urls: ["https://example.com"], unexpected: true }
  ]) assert.equal(actor.validateInput(input), false, JSON.stringify(input));
});

test("provider planner never marks unverified or scaffold providers ready", () => {
  const catalogue = listCollectionProviders();
  const connected = catalogue.map((provider, index) => ({
    id: String(index),
    provider_key: provider.key,
    status: "healthy",
    capabilities: [...provider.capabilities]
  }));
  const candidates = planCollectionProviders(["web_fetch"], catalogue, connected);
  for (const candidate of candidates) {
    if (candidate.verification === "candidate_unverified" || candidate.verification === "integration_scaffold") {
      assert.equal(candidate.ready, false, candidate.providerKey);
    }
  }
});

test("provider planner requires healthy status and explicit capability grants", () => {
  const catalogue = listCollectionProviders().filter((provider) => provider.key === "crawlee");
  const make = (status, capabilities) => [{ id: "p1", provider_key: "crawlee", status, capabilities }];
  assert.equal(planCollectionProviders(["web_fetch"], catalogue, make("configured", ["web_fetch", "web_crawl"]))[0].ready, false);
  assert.equal(planCollectionProviders(["web_fetch"], catalogue, make("healthy", ["web_crawl"]))[0].ready, false);
  assert.equal(planCollectionProviders(["web_fetch"], catalogue, make("healthy", ["web_fetch"]))[0].ready, true);
});

import { runCollectionActor, CollectionExecutionError } from "../src/collection/runner.ts";

const baseContext = {
  userId: "owner-1",
  runId: "run-1",
  providerKey: "test-adapter",
  checkpoint: {}
};
const outputItem = (itemKey = "item-1") => ({
  itemKey,
  sourceUrl: "https://example.com/",
  sourceType: "web",
  accessMethod: "official_test_fixture",
  permissionContext: { access: "fixture" },
  record: { title: "Example" }
});
const adapterFor = (execute, supports = () => true) => ({
  key: "test-adapter",
  executionModes: ["worker_fetch"],
  supports,
  execute
});

test("bounded runner persists items and returns matching counters", async () => {
  const persisted = [];
  const result = await runCollectionActor(actor, { urls: ["https://example.com"] }, adapterFor(async (_actor, _input, ctx) => {
    await ctx.reportProgress({ pages: 1, requests: 1, checkpoint: { cursor: "next" } });
    await ctx.emitItem(outputItem());
    return { status: "completed", counters: { pages: 1, items: 1, requests: 1 }, checkpoint: { cursor: "next" } };
  }), baseContext, {
    persistProgress: async () => {},
    persistItem: async (item) => persisted.push(item)
  });
  assert.equal(result.status, "completed");
  assert.deepEqual(result.counters, { pages: 1, items: 1, requests: 1 });
  assert.equal(persisted.length, 1);
});

test("bounded runner rejects adapters without required capabilities", async () => {
  await assert.rejects(
    runCollectionActor(actor, { urls: ["https://example.com"] }, adapterFor(async () => ({ status: "completed", counters: { pages: 0, items: 0, requests: 0 } }), () => false), baseContext, { persistProgress: async () => {}, persistItem: async () => {} }),
    (error) => error instanceof CollectionExecutionError && error.code === "ADAPTER_UNSUPPORTED"
  );
});

test("bounded runner rejects missing provenance and mismatched item counts", async () => {
  await assert.rejects(
    runCollectionActor(actor, { urls: ["https://example.com"] }, adapterFor(async (_a, _i, ctx) => {
      await ctx.emitItem({ itemKey: "bad", sourceType: "web", accessMethod: "test", permissionContext: {}, record: null });
      return { status: "completed", counters: { pages: 1, items: 1, requests: 1 } };
    }), baseContext, { persistProgress: async () => {}, persistItem: async () => {} }),
    (error) => error instanceof CollectionExecutionError && error.code === "INVALID_ITEM"
  );
  await assert.rejects(
    runCollectionActor(actor, { urls: ["https://example.com"] }, adapterFor(async () => ({ status: "completed", counters: { pages: 1, items: 1, requests: 1 } })), baseContext, { persistProgress: async () => {}, persistItem: async () => {} }),
    (error) => error instanceof CollectionExecutionError && error.code === "INVALID_ADAPTER_RESULT"
  );
});

test("bounded runner stops an adapter at its actor deadline", async () => {
  const shortActor = { ...actor, maxDurationMs: 15 };
  await assert.rejects(
    runCollectionActor(shortActor, { urls: ["https://example.com"] }, adapterFor(async (_a, _i, ctx) => {
      await new Promise((resolve) => {
        if (ctx.signal.aborted) return resolve();
        ctx.signal.addEventListener("abort", resolve, { once: true });
      });
      throw new Error("aborted");
    }), baseContext, { persistProgress: async () => {}, persistItem: async () => {} }),
    (error) => error instanceof CollectionExecutionError && error.code === "TIMEOUT"
  );
});
