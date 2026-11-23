import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  authorizeToolAction,
  classifyToolAction,
  DEFAULT_AUTONOMY_POLICY,
  getAutonomyPolicySummary
} from "../src/assistant/autonomy.ts";

test("default autonomy permits internal observation, analysis, drafting and bounded internal execution", () => {
  for (const name of ["research_list","research_discover_sources","products_create","jobs_cancel","memory_archive"]) {
    assert.equal(authorizeToolAction(name).allowed, true, name);
  }
  assert.deepEqual(DEFAULT_AUTONOMY_POLICY.enabledScopes, ["observe","analyse","draft","internal_execute"]);
});

test("external actions remain blocked until their scope and explicit approval are both present", () => {
  assert.equal(authorizeToolAction("outreach.send").allowed, false);
  const enabled = { enabledScopes: ["observe","analyse","draft","internal_execute","external_execute"], externalExecutionRequiresApproval: true } as const;
  assert.equal(authorizeToolAction("outreach.send", { policy: enabled }).allowed, false);
  assert.equal(authorizeToolAction("outreach.send", { policy: enabled, approved: true }).allowed, true);
});

test("financial actions are hard-denied even under a maximally permissive non-financial policy", () => {
  const broad = { enabledScopes: ["observe","analyse","draft","internal_execute","external_execute"], externalExecutionRequiresApproval: false } as const;
  for (const name of [
    "commerce.manage_payments",
    "payments.execute",
    "wallet_send",
    "bank.transfer",
    "subscription.purchase",
    "investment.trade",
    "payout.create",
    "loan.disburse",
    "checkout.charge",
    "invoice_payment.execute"
  ]) {
    const decision = authorizeToolAction(name, { policy: broad, approved: true });
    assert.equal(decision.allowed, false, name);
    assert.equal(decision.action, "financial", name);
    assert.match(decision.reason, /FINANCIAL_ACTION_HARD_DENY/, name);
  }
  assert.equal(getAutonomyPolicySummary().financial_execution, "hard_denied");
  assert.equal(getAutonomyPolicySummary().financial_hard_deny_is_overridable, false);
});

test("unknown tools fail closed instead of bypassing the permission engine", () => {
  assert.equal(classifyToolAction("unknown.execute"), "unknown");
  assert.equal(authorizeToolAction("unknown.execute").allowed, false);
});

test("permission scopes can be narrowed without changing the financial hard deny", () => {
  const readOnly = { enabledScopes: ["observe"], externalExecutionRequiresApproval: true };
  assert.equal(authorizeToolAction("research_list", { policy: readOnly }).allowed, true);
  assert.equal(authorizeToolAction("products_create", { policy: readOnly }).allowed, false);
  assert.equal(authorizeToolAction("payments.send", { policy: readOnly }).allowed, false);
});

test("assistant runtime enforces the autonomy policy before executing every model-requested tool", () => {
  const runtime = readFileSync(new URL("../src/assistant/runtime.ts", import.meta.url), "utf8");
  const authorization = runtime.indexOf("const autonomy = authorizeToolAction(name)");
  const execution = runtime.indexOf("executeTool(name, args", authorization);
  assert.ok(runtime.includes('import { authorizeToolAction } from "./autonomy";'));
  assert.ok(authorization >= 0 && execution > authorization);
  assert.ok(runtime.slice(authorization, execution).includes("if (!autonomy.allowed)"));
});

test("assistant capability registry exposes the active autonomy boundary", () => {
  const registry = readFileSync(new URL("../src/assistant/registry.ts", import.meta.url), "utf8");
  assert.ok(registry.includes('import { getAutonomyPolicySummary } from "./autonomy";'));
  assert.ok(registry.includes("autonomy: getAutonomyPolicySummary()"));
});
