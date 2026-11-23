import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/0040_marketing_assets.sql", import.meta.url), "utf8");
const page = readFileSync(new URL("../public/marketing.html", import.meta.url), "utf8");
const client = readFileSync(new URL("../public/marketing.js", import.meta.url), "utf8");

test("marketing assets are owner-scoped and cannot be mistaken for publishing integration", () => {
  assert.match(source, /"\/api\/v1\/marketing\/assets": "marketing_assets"/);
  assert.match(source, /marketing_assets: \["title","asset_type","platform","campaign_name","objective","audience","content","status","metadata"\]/);
  assert.match(migration, /alter table public\.marketing_assets enable row level security/);
  assert.match(migration, /for all using \(user_id = auth\.uid\(\)\) with check \(user_id = auth\.uid\(\)\)/);
  assert.match(migration, /No publishing or external delivery is enabled/);
  assert.ok(page.includes("Draft storage only."));
  assert.ok(client.includes("/api/v1/marketing/assets"));
  assert.ok(client.includes("Nothing was published or sent."));
});

test("marketing asset status transitions are bounded to draft review approved and archived", () => {
  assert.match(source, /\["draft","review","approved","archived"\]/);
  for (const state of ["draft","review","approved","archived"]) assert.ok(client.includes('value="'+state+'"'));
  assert.ok(client.includes('method:"PATCH"'));
});
