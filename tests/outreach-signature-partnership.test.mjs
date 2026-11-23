import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/migrations/0038_outreach_signature_and_partnership_terms.sql", import.meta.url), "utf8");

test("outbound signature is owner-controlled and missing signature fails closed", () => {
  assert.match(sql, /owner_message_settings/);
  assert.match(sql, /user_id uuid primary key references auth\.users\(id\)/);
  assert.match(sql, /gigo_set_owner_message_signature/);
  assert.match(sql, /outbound signature is not configured; sending is blocked/);
});

test("partnership campaigns get the deterministic 50/50 net-revenue offer", () => {
  assert.match(sql, /campaign_kind in \('general','partnership'\)/);
  assert.match(sql, /50\/50 split of net revenue attributable to this partnership/);
  assert.match(sql, /direct costs we both agree to in writing in advance/);
  assert.match(sql, /campaign_type='partnership'/);
});

test("all outbound messages enforce subject/body caps including the signature", () => {
  assert.match(sql, /char_length\(new\.subject\)>80/);
  assert.match(sql, /char_length\(new\.body_text\)>500/);
  assert.match(sql, /signature_line := '— ' \|\| trim\(owner_signature\)/);
});

test("campaign kind can only be changed by its owner while draft", () => {
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /status='draft' and approval_status in \('not_requested','rejected'\)/);
});

test("unsupported earnings guarantees and projections are rejected", () => {
  assert.match(sql, /guaranteed earnings\|guaranteed income\|you will earn\|projected earnings/);
});

test("policy is attached to the trusted message persistence path", () => {
  assert.match(sql, /before insert or update of subject,body_text,status on public\.outreach_messages/);
});
