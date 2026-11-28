import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runtime = readFileSync(new URL("../src/assistant/runtime.ts", import.meta.url), "utf8");
const registry = readFileSync(new URL("../src/assistant/registry.ts", import.meta.url), "utf8");
const autonomy = readFileSync(new URL("../src/assistant/autonomy.ts", import.meta.url), "utf8");

test("GiGo Assistant can manage private support cases without contacting customers", () => {
  for (const name of ["customers_list_cases","customers_create_case","customers_update_case"]) {
    assert.equal((runtime.match(new RegExp('name: "'+name+'"',"g"))||[]).length,1);
    assert.equal((runtime.match(new RegExp('if \\(name === "'+name+'"\\)',"g"))||[]).length,1);
  }
  assert.ok(registry.includes('id:"customers.list_cases"'));
  assert.ok(registry.includes('id:"customers.create_case"'));
  assert.ok(registry.includes('id:"customers.update_case"'));
  assert.ok(runtime.includes("customer_contacted: false"));
  assert.ok(runtime.includes("response_sent: false"));
});

test("Customer Success assistant tools use only observe, draft and internal scopes", () => {
  assert.match(autonomy,/customers_list_cases: "observe"/);
  assert.match(autonomy,/customers_create_case: "draft"/);
  assert.match(autonomy,/customers_update_case: "internal_execute"/);
  assert.equal((autonomy.match(/customers_list_cases:/g)||[]).length,1);
  assert.equal((autonomy.match(/customers_create_case:/g)||[]).length,1);
  assert.equal((autonomy.match(/customers_update_case:/g)||[]).length,1);
  assert.ok(!runtime.includes("send_customer_message"));
});
