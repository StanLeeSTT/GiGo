import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/0042_creative_briefs.sql", import.meta.url), "utf8");
const page = readFileSync(new URL("../public/creative.html", import.meta.url), "utf8");
const client = readFileSync(new URL("../public/creative.js", import.meta.url), "utf8");

test("Creative Studio briefs are owner-scoped and support bounded production states", () => {
  assert.ok(source.includes('"/api/v1/creative/briefs": "creative_briefs"'));
  assert.match(migration, /alter table public\.creative_briefs enable row level security/);
  assert.match(migration, /user_id = auth\.uid\(\)/);
  assert.match(migration, /No publishing or paid asset generation is enabled/);
  assert.ok(page.includes('id="creative-form"'));
  assert.ok(client.includes("/api/v1/creative/briefs"));
  for (const state of ["draft","ready","in_progress","complete","archived"]) assert.ok(client.includes('"'+state+'"'));
});

test("Creative Studio stores prompts and references but does not claim media generation", () => {
  assert.ok(page.includes("does not itself generate media"));
  assert.ok(client.includes("generation_prompt"));
  assert.ok(client.includes("reference_urls"));
  assert.ok(client.includes("No media was generated or published."));
});
