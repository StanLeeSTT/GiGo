import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const adapter = readFileSync(new URL("../src/integrations/whop.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/0047_whop_readonly_sales_ledger.sql", import.meta.url), "utf8");
const docs = readFileSync(new URL("../docs/WHOP_APIFY_INTEGRATION.md", import.meta.url), "utf8");

test("Whop webhook is signature-verified, idempotent and stores only allow-listed fields", () => {
  const start = source.indexOf('if (url.pathname === "/api/v1/webhooks/whop")');
  const end = source.indexOf('if (url.pathname === "/api/v1/collection/providers/register")', start);
  const route = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  for (const required of ["WHOP_WEBHOOK_SECRET", "WHOP_OWNER_USER_ID", "WHOP_ACCOUNT_ID", "WHOP_ACCOUNT_MISMATCH", "eventData.company", "company.id", "verifyWhopWebhook", "normalizeWhopSalesEvent", "whop_payment_events", "resolution=ignore-duplicates"]) {
    assert.ok(route.includes(required), required);
  }
  assert.match(route, /biz_/);
  assert.match(adapter, /webhook-timestamp/);
  assert.match(adapter, /webhook-signature/);
  assert.match(adapter, /Math\.abs\(nowMs \/ 1000 - timestamp\) > 300/);
  assert.match(adapter, /SUPPORTED_EVENTS/);
  assert.doesNotMatch(route + adapter, /payout:transfer_funds|payout:withdraw_funds|withdraw_funds|transfer_funds/);
});

test("Whop ledger is server-only and never grants browser roles", () => {
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on public\.whop_payment_events from public, anon, authenticated/i);
  assert.match(migration, /grant select, insert on public\.whop_payment_events to service_role/i);
  assert.match(migration, /unique \(user_id, whop_event_id\)/);
  assert.match(migration, /No payout, balance, transfer, withdrawal/);
});

test("Whop sales report is restricted to the configured owner and does not claim commission calculations", () => {
  const start = source.indexOf('if (url.pathname === "/api/v1/whop/sales")');
  const end = source.indexOf('if (url.pathname === "/api/v1/webhooks/whop")', start);
  const route = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(route, /userId !== env\.WHOP_OWNER_USER_ID/);
  assert.match(route, /commission_calculation: "not_configured"/);
  assert.match(route, /limited_to_latest: 500/);
  assert.match(docs, /monthly quota policy/);
  assert.match(docs, /registered by the trusted batch worker/);
});
