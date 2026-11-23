import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/migrations/0043_research_evidence_traceability.sql", import.meta.url), "utf8");

test("research evidence passages preserve exact excerpts and source locators", () => {
  assert.match(sql, /research_evidence_passages/);
  assert.match(sql, /passage_text text not null/);
  assert.match(sql, /locator_type.*page.*paragraph.*section.*timestamp.*row.*cell_range/s);
  assert.match(sql, /content_sha256.*\\^\\[0-9a-f\\]\\{64\\}\\$/);
  assert.match(sql, /review_status text not null default 'unreviewed'/);
});

test("claims remain unverified until explicitly reviewed", () => {
  assert.match(sql, /verification_status text not null default 'unverified'/);
  assert.match(sql, /'supported'.*'mixed'.*'contradicted'.*'insufficient_evidence'/s);
  assert.match(sql, /confidence.*between 0 and 100/);
});

test("claim evidence must link same-owner, same-run claim and passage", () => {
  assert.match(sql, /gigo_check_research_evidence_ownership/);
  assert.match(sql, /claim and passage must belong to the same owner and research run/);
  assert.match(sql, /research_claim_evidence_owner_all/);
  assert.match(sql, /research_passages_owner_all/);
  assert.match(sql, /research_claims_owner_all/);
});

test("all new research evidence tables enforce row-level security", () => {
  for (const table of ["research_evidence_passages","research_claims","research_claim_evidence"]) {
    assert.match(sql, new RegExp("alter table public\\." + table + " enable row level security"));
  }
});
