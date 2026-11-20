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
