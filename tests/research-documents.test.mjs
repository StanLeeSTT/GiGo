import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source=readFileSync(new URL("../src/index.ts",import.meta.url),"utf8");
const migration=readFileSync(new URL("../supabase/migrations/0044_private_research_documents.sql",import.meta.url),"utf8");
const page=readFileSync(new URL("../public/research.html",import.meta.url),"utf8");
const client=readFileSync(new URL("../public/research.js",import.meta.url),"utf8");
const shared=readFileSync(new URL("../public/shared.js",import.meta.url),"utf8");

test("private research document storage requires R2, owner session and a verified owner research run",()=>{
 const start=source.indexOf("async function handleResearchDocuments");
 const end=source.indexOf("async function handleResearchReport",start);
 const handler=source.slice(start,end);
 assert.ok(start>=0&&end>start);
 for(const text of ["RESEARCH_FILES","verifiedUserId(token, env)","research_runs?select=id","file.size>5*1024*1024","text/plain","text/html","text/csv","application/pdf","expectedExtensions","INVALID_FILE_SIGNATURE","crypto.subtle.digest","RESEARCH_FILES.put","RESEARCH_FILES.get"]) assert.ok(handler.includes(text),text);
 assert.ok(source.includes('url.pathname === "/api/v1/research/documents"'));
});

test("research document metadata is private and owner/run scoped",()=>{
 assert.match(migration,/enable row level security/i);
 assert.match(migration,/research_run_id uuid not null references public\.research_runs/);
 assert.match(migration,/gigo_check_research_document_owner/);
 assert.match(migration,/byte_size between 1 and 5242880/);
 assert.match(migration,/content_sha256 ~ '\^\[0-9a-f\]\{64\}\$'/);
});

test("research page supports private document uploads and safe multipart authorization",()=>{
 assert.ok(page.includes('id="research-document-form"'));
 assert.ok(page.includes('id="research-document-list"'));
 assert.ok(client.includes('new FormData()'));
 assert.ok(client.includes('"/api/v1/research/documents"'));
 assert.match(shared,/options\.body&&!\(options\.body instanceof FormData\)/);
});

test("private document extraction verifies integrity and persists idempotent owner-scoped evidence",()=>{
 const start=source.indexOf("async function handleResearchDocumentExtraction");
 const end=source.indexOf("async function handleResearchReport",start);
 const handler=source.slice(start,end);
 assert.ok(start>=0&&end>start);
 for(const text of ["verifiedUserId(token, env)","RESEARCH_FILES.get","crypto.subtle.digest","DOCUMENT_INTEGRITY_FAILED","buildResearchDocumentIngestionPlan","research_sources?on_conflict=research_run_id,url","research_document_id,locator_type,locator_value","review_status: \"unreviewed\"","claim_verification"]) assert.ok(handler.includes(text),text);
 assert.ok(source.includes('url.pathname === "/api/v1/research/documents/extract"'));
});
