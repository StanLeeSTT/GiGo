import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/0041_customer_support_cases.sql", import.meta.url), "utf8");
const page = readFileSync(new URL("../public/customers.html", import.meta.url), "utf8");
const client = readFileSync(new URL("../public/customers.js", import.meta.url), "utf8");

test("Customer Success cases are owner-scoped and bounded", () => {
  assert.match(source, /"\/api\/v1\/customers\/cases": "customer_support_cases"/);
  assert.match(source, /customer_support_cases: \["customer_name","customer_email","subject","issue_description","priority","status","response_draft","internal_notes","source","resolved_at"\]/);
  assert.match(migration, /alter table public\.customer_support_cases enable row level security/);
  assert.match(migration, /user_id = auth\.uid\(\)/);
  assert.match(source, /INVALID_SUPPORT_CASE/);
  assert.match(source, /INVALID_CUSTOMER_EMAIL/);
});

test("Customer Success UI stores response drafts without external delivery", () => {
  for (const id of ["case-form","customer-status","case-list","refresh-cases"]) assert.ok(page.includes('id="'+id+'"'));
  assert.ok(page.includes("Internal support tracking only."));
  assert.ok(client.includes("/api/v1/customers/cases"));
  assert.ok(client.includes("Response draft (not sent)"));
  assert.ok(client.includes("No customer was contacted."));
  assert.ok(client.includes("The response remains a draft and was not sent."));
});
