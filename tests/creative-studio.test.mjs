import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Creative Studio stores owner-scoped briefs and output references only", () => {
  const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  const sql = readFileSync(new URL("../supabase/migrations/0042_creative_briefs.sql", import.meta.url), "utf8");
  const html = readFileSync(new URL("../public/creative.html", import.meta.url), "utf8");
  const js = readFileSync(new URL("../public/creative.js", import.meta.url), "utf8");
  assert.ok(source.includes('"/api/v1/creative/briefs": "creative_briefs"'));
  assert.ok(source.includes("INVALID_CREATIVE_BRIEF"));
  assert.ok(source.includes("INVALID_REFERENCE_URLS"));
  assert.ok(sql.includes("for all using (user_id = auth.uid()) with check (user_id = auth.uid())"));
  assert.ok(html.includes("does not itself generate media"));
  assert.ok(js.includes("/api/v1/creative/briefs"));
  assert.ok(js.includes("No media was generated or published."));
  assert.ok(js.includes("Output URL must be a valid HTTPS URL."));
});

test("Creative Studio bounds asset types, reference links and production states", () => {
  const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  const sql = readFileSync(new URL("../supabase/migrations/0042_creative_briefs.sql", import.meta.url), "utf8");
  assert.ok(source.includes('["image","video","audio","brand_identity","presentation","other"]'));
  assert.ok(source.includes('["draft","ready","in_progress","complete","archived"]'));
  assert.ok(sql.includes("reference_urls jsonb not null default '[]'::jsonb"));
});
