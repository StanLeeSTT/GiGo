import test from "node:test";
import assert from "node:assert/strict";
import { registerCollectionAdapter, clearCollectionAdaptersForTests } from "../src/collection/adapters.ts";
import { runCollectionWorkerBatch } from "../src/collection/worker.ts";

const claim = {
  job_id: "job-1",
  user_id: "owner-1",
  run_id: "run-1",
  dataset_id: "dataset-1",
  actor_key: "public_page_metadata",
  actor_version: 1,
  provider_key: "crawlee",
  actor_input: { urls: ["https://example.com"] },
  checkpoint: {},
  attempts: 1,
  lease_token: "lease-1",
  lease_expires_at: "2026-11-20T20:00:00.000Z"
};

const item = {
  itemKey: "example",
  sourceUrl: "https://example.com/",
  sourceType: "web",
  accessMethod: "public_web_permitted",
  permissionContext: { robots_checked: true },
  record: { title: "Example" }
};

function mockStore(overrides = {}) {
  const calls = { claims: 0, progress: [], items: [], finishes: [], retries: [] };
  const store = {
    async claim() { calls.claims += 1; return [claim]; },
    async heartbeat() { return true; },
    async progress(...args) { calls.progress.push(args); return true; },
    async persistItem(...args) { calls.items.push(args); return "inserted"; },
    async finish(...args) { calls.finishes.push(args); return true; },
    async retry(...args) { calls.retries.push(args); return "retry_scheduled"; },
    ...overrides
  };
  return { store, calls };
}

test("worker does not claim jobs while no adapters are registered", async () => {
  clearCollectionAdaptersForTests();
  const { store, calls } = mockStore();
  const result = await runCollectionWorkerBatch(store);
  assert.deepEqual(result, { claimed: 0, completed: 0, retried: 0, failed: 0, skipped: true });
  assert.equal(calls.claims, 0);
});

test("worker executes a claimed run and persists progress, items and completion", async () => {
  clearCollectionAdaptersForTests();
  registerCollectionAdapter({
    key: "crawlee",
    executionModes: ["batch_runner"],
    supports: () => true,
    async execute(_actor, _input, context) {
      await context.reportProgress({ pages: 1, requests: 1, checkpoint: { cursor: "page-2" } });
      await context.emitItem(item);
      return { status: "completed", counters: { pages: 1, items: 1, requests: 1 }, checkpoint: { cursor: "done" } };
    }
  });
  const { store, calls } = mockStore();
  const result = await runCollectionWorkerBatch(store);
  assert.deepEqual(result, { claimed: 1, completed: 1, retried: 0, failed: 0, skipped: false });
  assert.equal(calls.progress.length, 2, "intermediate and final snapshots should be saved");
  assert.equal(calls.items.length, 1);
  assert.equal(calls.finishes[0][2], "completed");
  assert.equal(calls.retries.length, 0);
  clearCollectionAdaptersForTests();
});

test("worker safely retries a job when its provider adapter is not registered", async () => {
  clearCollectionAdaptersForTests();
  registerCollectionAdapter({
    key: "other-provider",
    executionModes: ["worker_fetch"],
    supports: () => true,
    async execute() { throw new Error("must not execute"); }
  });
  const { store, calls } = mockStore();
  const result = await runCollectionWorkerBatch(store);
  assert.deepEqual(result, { claimed: 1, completed: 0, retried: 1, failed: 0, skipped: false });
  assert.equal(calls.retries.length, 1);
  assert.equal(calls.retries[0][2].code, "ADAPTER_NOT_REGISTERED");
  clearCollectionAdaptersForTests();
});

test("worker marks permanent actor-output errors as failed instead of retrying", async () => {
  clearCollectionAdaptersForTests();
  registerCollectionAdapter({
    key: "crawlee",
    executionModes: ["batch_runner"],
    supports: () => true,
    async execute(_actor, _input, context) {
      await context.emitItem({ ...item, record: null });
      return { status: "completed", counters: { pages: 1, items: 1, requests: 1 } };
    }
  });
  const { store, calls } = mockStore();
  const result = await runCollectionWorkerBatch(store);
  assert.deepEqual(result, { claimed: 1, completed: 0, retried: 0, failed: 1, skipped: false });
  assert.equal(calls.finishes[0][2], "failed");
  assert.equal(calls.retries.length, 0);
  clearCollectionAdaptersForTests();
});

test("worker retries safely when lease heartbeat is lost", async () => {
  clearCollectionAdaptersForTests();
  registerCollectionAdapter({
    key: "crawlee", executionModes: ["batch_runner"], supports: () => true,
    async execute(_actor, _input, context) {
      await new Promise(resolve => setTimeout(resolve, 10));
      if (context.signal.aborted) throw context.signal.reason;
      return { status: "completed", counters: { pages: 0, items: 0, requests: 0 } };
    }
  });
  const { store, calls } = mockStore({ async heartbeat() { return false; } });
  const result = await runCollectionWorkerBatch(store, { heartbeatIntervalMs: 1 });
  assert.equal(result.completed, 0);
  assert.equal(result.retried, 1);
  assert.equal(calls.retries[0][2].code, "LEASE_HEARTBEAT_FAILED");
  clearCollectionAdaptersForTests();
});
