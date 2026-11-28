import test from "node:test";
import assert from "node:assert/strict";
import { buildResearchDocumentIngestionPlan } from "../src/research/ingest.ts";

const document = {
  id: "11111111-1111-4111-8111-111111111111",
  research_run_id: "22222222-2222-4222-8222-222222222222",
  original_filename: "market-notes.txt",
  content_type: "text/plain",
  content_sha256: "a".repeat(64)
};

test("document ingestion maps decoded text to a provenance source and unreviewed passages", () => {
  const plan = buildResearchDocumentIngestionPlan(document, "First paragraph.\n\nSecond paragraph.");
  assert.equal(plan.source.url, "gigo://research-document/" + document.id);
  assert.equal(plan.source.source_type, "report");
  assert.equal(plan.source.metadata.research_document_id, document.id);
  assert.equal(plan.source.metadata.claim_verification, "not_performed");
  assert.equal(plan.passages.length, 2);
  assert.equal(plan.passages[1].locator_value, "2");
  assert.equal(plan.passages[0].review_status, "unreviewed");
  assert.equal(plan.passages[0].content_sha256, document.content_sha256);
  assert.equal(plan.passages[0].research_document_id, document.id);
});

test("HTML and CSV uploads use the bounded existing extractors", () => {
  const html = buildResearchDocumentIngestionPlan({ ...document, content_type: "text/html" }, "<p>Useful text</p><script>ignore()</script>");
  assert.match(html.passages[0].passage_text, /Useful text/);
  assert.doesNotMatch(html.passages[0].passage_text, /ignore/);
  const csv = buildResearchDocumentIngestionPlan({ ...document, content_type: "text/csv" }, 'name,note\nAda,"hello, world"');
  assert.equal(csv.passages[1].locator_type, "row");
  assert.match(csv.passages[1].passage_text, /hello, world/);
});

test("unsupported formats, invalid provenance and oversized content fail closed", () => {
  assert.throws(() => buildResearchDocumentIngestionPlan({ ...document, content_type: "application/pdf" }, "text"), /NOT_EXTRACTABLE/);
  assert.throws(() => buildResearchDocumentIngestionPlan({ ...document, content_sha256: "bad" }, "text"), /HASH/);
  assert.throws(() => buildResearchDocumentIngestionPlan({ ...document, id: "bad" }, "text"), /REFERENCE/);
  assert.throws(() => buildResearchDocumentIngestionPlan(document, "x".repeat(500001)), /TOO_LARGE/);
});
