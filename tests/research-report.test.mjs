import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source=readFileSync(new URL("../src/index.ts",import.meta.url),"utf8");
const page=readFileSync(new URL("../public/research.html",import.meta.url),"utf8");
const client=readFileSync(new URL("../public/research.js",import.meta.url),"utf8");

test("research report endpoint requires authenticated owner and valid research run ID",()=>{
 const start=source.indexOf("async function handleResearchReport");
 const end=source.indexOf("type ResearchResource",start);
 const handler=source.slice(start,end);
 assert.ok(start>=0&&end>start);
 assert.match(handler,/request\.method !== "GET"/);
 assert.match(handler,/bearerToken\(request\)/);
 assert.match(handler,/verifiedUserId\(token, env\)/);
 assert.match(handler,/research_runs\?/);
 assert.match(handler,/research_claim_evidence\?/);
 assert.match(handler,/RESEARCH_RUN_NOT_FOUND/);
 assert.match(handler,/verification_notice/);
 assert.ok(source.includes('url.pathname === "/api/v1/research/report"'));
});

test("research page exports claims, evidence links, source list and opportunities as Markdown",()=>{
 assert.ok(page.includes('id="export-research-report"'));
 assert.ok(client.includes("/api/v1/research/report?research_run_id="));
 for(const term of ["## Claims","## Sources","## Exact evidence passages","## Opportunities","verification_notice","text/markdown;charset=utf-8"]) assert.ok(client.includes(term),term);
 assert.ok(client.includes("exportButton.disabled=false"));
});
