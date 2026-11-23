import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

test("research evidence passages, claims and claim-evidence links are exposed as authenticated resources", () => {
  for (const route of [
    '"/api/v1/research/evidence-passages": "research_evidence_passages"',
    '"/api/v1/research/claims": "research_claims"',
    '"/api/v1/research/claim-evidence": "research_claim_evidence"'
  ]) assert.ok(source.includes(route), "missing route " + route);
});

test("research API restricts evidence and claim fields and verification states", () => {
  assert.match(source, /research_evidence_passages: \["research_run_id","research_source_id","passage_text"/);
  assert.match(source, /research_claims: \["research_run_id","claim_text","claim_type","verification_status"/);
  assert.match(source, /research_claim_evidence: \["research_run_id","claim_id","passage_id","relationship"/);
  assert.match(source, /"unverified","supported","mixed","contradicted","insufficient_evidence"/);
  assert.match(source, /"supports","contradicts","context"/);
});

test("passage and claim inputs have explicit size limits and linked IDs are UUID checked", () => {
  assert.match(source, /key === "passage_text" \? 12000/);
  assert.match(source, /key === "claim_text" \? 3000/);
  assert.match(source, /for \(const key of \["research_source_id","claim_id","passage_id"\]\)/);
});
