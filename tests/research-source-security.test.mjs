import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const client = readFileSync(new URL("../public/research.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../public/research.html", import.meta.url), "utf8");

test("research source creation and edits reject unsafe non-HTTPS URLs", () => {
  assert.ok(source.includes('resource === "research_sources" && input.url !== undefined'));
  assert.ok(source.includes('parsed.protocol !== "https:"'));
  assert.ok(source.includes("parsed.username || parsed.password"));
  assert.ok(source.includes("INVALID_SOURCE_URL"));
  assert.ok(page.includes('name="url" type="url"'));
  assert.ok(client.includes('safeHttps(s.url)||"#"'));
});

test("evidence review remains a human assessment rather than automatic fact verification", () => {
  for (const state of ["unreviewed","supports","contradicts","context","rejected"]) assert.ok(source.includes('"'+state+'"'));
  assert.ok(client.includes("This is your review label, not an automatic fact-check."));
});
