import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const migration=readFileSync(new URL("../supabase/migrations/0045_research_document_passage_provenance.sql",import.meta.url),"utf8");
const ingestion=readFileSync(new URL("../src/research/ingest.ts",import.meta.url),"utf8");

test("document passage provenance is a private owner/run-scoped foreign key",()=>{
 assert.match(migration,/research_document_id uuid[\s\S]*references public\.research_documents\(id\) on delete cascade/i);
 assert.match(migration,/document_owner is distinct from new\.user_id/i);
 assert.match(migration,/document_run is distinct from new\.research_run_id/i);
 assert.match(migration,/gigo:\/\/research-document\//i);
 assert.match(migration,/research_document_id is null or exists[\s\S]*public\.research_documents/i);
});

test("ingestion attaches document provenance and keeps evidence unreviewed",()=>{
 assert.match(ingestion,/research_document_id: document\.id/);
 assert.match(ingestion,/review_status: "unreviewed"/);
 assert.match(ingestion,/claim_verification: "not_performed"/);
});

test("document passage upserts have stable unique locators for safe retries",()=>{
 assert.match(migration,/create unique index if not exists research_passages_document_locator_uidx/i);
 assert.match(migration,/research_document_id, locator_type, locator_value/i);
 assert.doesNotMatch(migration,/\\\\n/);
 assert.match(ingestion,/research_document_id: document\.id/);
});
