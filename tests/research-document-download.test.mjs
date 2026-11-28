import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const shared=readFileSync(new URL("../public/shared.js",import.meta.url),"utf8");
const research=readFileSync(new URL("../public/research.js",import.meta.url),"utf8");

test("shared download helper uses authenticated fetch and refreshes expired sessions",()=>{
 assert.match(shared,/async download\(path,filename="download"\)/);
 assert.match(shared,/authorization:"Bearer "\+token/);
 assert.match(shared,/this\.refresh\(\)/);
 assert.match(shared,/URL\.createObjectURL\(blob\)/);
 assert.match(shared,/URL\.revokeObjectURL\(objectUrl\)/);
 assert.ok(shared.includes('const safeName=String(filename||"download")'));
 assert.ok(shared.includes('.slice(0,180)'));
});

test("private research document cards expose authenticated download and extraction actions",()=>{
 assert.match(research,/data-download-document=/);
 assert.match(research,/api\.download\("\/api\/v1\/research\/documents\?id=/);
 assert.match(research,/data-extract-document=/);
});
