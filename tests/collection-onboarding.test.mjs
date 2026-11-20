import test from "node:test";
import assert from "node:assert/strict";
import { buildSafeHttpProviderRegistration, isSafeHttpProviderRegistrationRequest } from "../src/collection/onboarding.ts";

test("safe HTTP provider registration is fixed, non-secret and starts non-healthy", () => {
  const row = buildSafeHttpProviderRegistration("owner-uuid");
  assert.equal(row.provider_key, "gigo_safe_http_batch");
  assert.equal(row.status, "configured");
  assert.deepEqual(row.capabilities, ["web_fetch"]);
  assert.equal(row.configuration.runner, "github_actions");
  assert.equal(JSON.stringify(row).includes("secret"), false);
  assert.equal("api_key" in row.configuration, false);
});

test("provider registration accepts only the exact supported provider key", () => {
  assert.equal(isSafeHttpProviderRegistrationRequest({ provider_key: "gigo_safe_http_batch" }), true);
  assert.equal(isSafeHttpProviderRegistrationRequest({ provider_key: "crawlee" }), false);
  assert.equal(isSafeHttpProviderRegistrationRequest({ provider_key: "gigo_safe_http_batch", status: "healthy" }), false);
  assert.equal(isSafeHttpProviderRegistrationRequest(null), false);
});
