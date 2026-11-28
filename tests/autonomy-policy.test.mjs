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
  const enabled = { enabledScopes: ["observe","analyse","draft","internal_execute","external_execute"], externalExecutionRequiresApproval: true };
  assert.equal(authorizeToolAction("outreach.send", { policy: enabled }).allowed, false);
  assert.equal(authorizeToolAction("outreach.send", { policy: enabled, approved: true }).allowed, true);
});

test("financial actions are hard-denied even under a maximally permissive non-financial policy", () => {
  const broad = { enabledScopes: ["observe","analyse","draft","internal_execute","external_execute"], externalExecutionRequiresApproval: false };
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

test("assistant runtime reads durable pause and scope policy before each tool and audits the decision", () => {
  const runtime = readFileSync(new URL("../src/assistant/runtime.ts", import.meta.url), "utf8");
  const gate = runtime.indexOf("durableAutonomyGate(env, token, ownerId, name)");
  const execution = runtime.indexOf("executeTool(name, args", gate);
  assert.ok(runtime.includes("autonomy_control_state"));
  assert.ok(runtime.includes("autonomy_policies"));
  assert.ok(runtime.includes("writeAutonomyAudit"));
  assert.ok(runtime.includes("SUPABASE_SECRET_KEY"));
  assert.ok(gate >= 0 && execution > gate);
  assert.ok(runtime.slice(gate, execution).includes("if (!gate.allowed)"));
  assert.ok(runtime.includes("Durable autonomy policy storage is unavailable"));
  assert.ok(runtime.includes("The required autonomy audit could not be written"));
});

test("assistant capability registry exposes the active autonomy boundary", () => {
  const registry = readFileSync(new URL("../src/assistant/registry.ts", import.meta.url), "utf8");
  assert.ok(registry.includes('import { getAutonomyPolicySummary } from "./autonomy";'));
  assert.ok(registry.includes("autonomy: getAutonomyPolicySummary()"));
});


test("Marketing Assistant tools can only read or save owner-private drafts", () => {
  assert.equal(authorizeToolAction("marketing_list_assets").allowed, true);
  assert.equal(authorizeToolAction("marketing_create_asset").allowed, true);
  const runtime = readFileSync(new URL("../src/assistant/runtime.ts", import.meta.url), "utf8");
  const registry = readFileSync(new URL("../src/assistant/registry.ts", import.meta.url), "utf8");
  assert.ok(runtime.includes('name: "marketing_list_assets"'));
  assert.ok(runtime.includes('name: "marketing_create_asset"'));
  assert.ok(runtime.includes("published: false, sent: false"));
  assert.ok(registry.includes('id:"marketing.write_assets"'));
  assert.ok(registry.includes('state:"available"'));
  assert.ok(!runtime.includes('name: "marketing_publish"'));
});


test("Customer Success Assistant tools only create and update private support records", () => {
  assert.equal(authorizeToolAction("customers_list_cases").allowed, true);
  assert.equal(authorizeToolAction("customers_create_case").allowed, true);
  assert.equal(authorizeToolAction("customers_update_case").allowed, true);
  const runtime = readFileSync(new URL("../src/assistant/runtime.ts", import.meta.url), "utf8");
  const registry = readFileSync(new URL("../src/assistant/registry.ts", import.meta.url), "utf8");
  assert.ok(runtime.includes('name: "customers_list_cases"'));
  assert.ok(runtime.includes('name: "customers_create_case"'));
  assert.ok(runtime.includes('name: "customers_update_case"'));
  assert.ok(runtime.includes("customer_contacted: false"));
  assert.ok(runtime.includes("response_sent: false"));
  assert.ok(registry.includes('id:"customers.create_case"') && registry.includes('id:"customers.update_case"'));
  assert.ok(registry.includes('state:"available"'));
  assert.ok(!runtime.includes('name: "customers_send_response"'));
});


test("Creative Studio Assistant tools save private briefs and track outputs without generating media", () => {
  for (const name of ["creative_list_briefs","creative_create_brief","creative_update_brief"]) assert.equal(authorizeToolAction(name).allowed, true, name);
  const runtime = readFileSync(new URL("../src/assistant/runtime.ts", import.meta.url), "utf8");
  const registry = readFileSync(new URL("../src/assistant/registry.ts", import.meta.url), "utf8");
  assert.ok(runtime.includes('name: "creative_list_briefs"'));
  assert.ok(runtime.includes('name: "creative_create_brief"'));
  assert.ok(runtime.includes('name: "creative_update_brief"'));
  assert.ok(runtime.includes("media_generated: false, published: false"));
  assert.ok(runtime.includes("media_published: false"));
  assert.ok(registry.includes('id:"creative.generate_assets"'));
  assert.ok(registry.includes('state:"available"'));
});


test("Outreach Assistant tools only prepare owner-approved message drafts and never send", () => {
  for (const name of ["outreach_list_campaigns","outreach_create_campaign","outreach_add_recipient","outreach_add_template"]) assert.equal(authorizeToolAction(name).allowed, true, name);
  assert.equal(authorizeToolAction("outreach_prepare_campaign").allowed, true);
  assert.equal(authorizeToolAction("outreach.send").allowed, false);
  const runtime = readFileSync(new URL("../src/assistant/runtime.ts", import.meta.url), "utf8");
  const registry = readFileSync(new URL("../src/assistant/registry.ts", import.meta.url), "utf8");
  assert.ok(runtime.includes('name: "outreach_prepare_campaign"'));
  assert.ok(runtime.includes('campaign[0].approval_status !== "approved"'));
  assert.ok(runtime.includes('contact_authorization_status=eq.approved'));
  assert.ok(runtime.includes('marketing_contact_registered=eq.true'));
  assert.ok(runtime.includes("provider_send_performed: false"));
  assert.ok(runtime.includes("subject.length > 80"));
  assert.ok(runtime.includes("body.length > 340"));
  assert.ok(!runtime.includes('name: "outreach_send_message"'));
  assert.ok(registry.includes('id:"outreach.prepare_campaign"'));
});
