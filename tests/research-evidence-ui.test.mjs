import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../public/research.html", import.meta.url), "utf8");
const client = readFileSync(new URL("../public/research.js", import.meta.url), "utf8");

test("research evidence can be assessed by the authenticated owner through the existing PATCH API", () => {
  assert.match(source, /research_sources: \["research_run_id","source_type","title","url","publisher","published_at","excerpt","relevance_score","evidence_status","metadata"\]/);
  assert.match(source, /resource === "research_sources" && input\.evidence_status !== undefined && !\["unreviewed","supports","contradicts","context","rejected"\]/);
  assert.match(source, /method === "PATCH" && \(!id/);
  assert.ok(page.includes('id="source-list"'));
  assert.ok(client.includes('data-evidence-status='));
  assert.ok(client.includes('data-save-evidence='));
  assert.ok(client.includes('method:"PATCH"'));
  assert.ok(client.includes("This is your review label, not an automatic fact-check."));
});

test("research evidence review labels are distinct and do not auto-verify claims", () => {
  for (const label of ["unreviewed","supports","contradicts","context","rejected"]) assert.ok(client.includes('value="'+label+'"'));
  assert.ok(client.includes("Evidence assessment saved"));
  assert.ok(client.includes("evidence_status:select.value"));
});

test("research UI supports exact passages, atomic claims and evidence linking", () => {
  for (const id of ["passage-form","claim-form","claim-evidence-form","passage-list","claim-list","claim-evidence-list"]) assert.ok(page.includes('id="'+id+'"'));
  for (const endpoint of ["/api/v1/research/evidence-passages","/api/v1/research/claims","/api/v1/research/claim-evidence"]) assert.ok(client.includes(endpoint));
  assert.ok(client.includes('verification_status:"unverified"'));
  assert.ok(client.includes("Claim review saved"));
  assert.ok(client.includes("not automatic fact-checking"));
});
