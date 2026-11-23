import test from "node:test";
import assert from "node:assert/strict";
import { extractResearchPassages } from "../src/research/extract.ts";

test("plain text is split into bounded paragraphs with locators", () => {
  const result = extractResearchPassages({content:"First paragraph.\n\nSecond paragraph.",contentType:"text/plain"});
  assert.equal(result.extraction_method,"manual");
  assert.equal(result.passages.length,2);
  assert.equal(result.passages[1].locator_value,"2");
});

test("HTML extraction removes scripts, styles and markup", () => {
  const result = extractResearchPassages({content:"<h1>Title</h1><script>secret()</script><p>Hello &amp; welcome</p>",contentType:"text/html"});
  const text=result.passages.map(p=>p.passage_text).join(" ");
  assert.match(text,/Title/); assert.match(text,/Hello & welcome/); assert.doesNotMatch(text,/secret/);
});

test("CSV extraction preserves row and cell locators including quoted commas", () => {
  const result = extractResearchPassages({content:'name,note\nAda,"hello, world"\n',contentType:"text/csv"});
  assert.equal(result.passages.length,2);
  assert.equal(result.passages[1].locator_value,"2");
  assert.match(result.passages[1].passage_text,/hello, world/);
});

test("binary PDF and unsupported content types fail closed", () => {
  assert.throws(()=>extractResearchPassages({content:"%PDF",contentType:"application/pdf"}),/PDF_TEXT_EXTRACTION_UNAVAILABLE/);
  assert.throws(()=>extractResearchPassages({content:"x",contentType:"application/octet-stream"}),/UNSUPPORTED_RESEARCH_CONTENT_TYPE/);
});

test("oversized content and malformed CSV fail closed", () => {
  assert.throws(()=>extractResearchPassages({content:"x".repeat(500001),contentType:"text/plain"}),/TOO_LARGE/);
  assert.throws(()=>extractResearchPassages({content:'a,"broken',contentType:"text/csv"}),/CSV_UNCLOSED_QUOTE/);
});
