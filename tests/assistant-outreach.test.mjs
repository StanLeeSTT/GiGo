import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runtime = readFileSync(new URL("../src/assistant/runtime.ts", import.meta.url), "utf8");
const registry = readFileSync(new URL("../src/assistant/registry.ts", import.meta.url), "utf8");
const autonomy = readFileSync(new URL("../src/assistant/autonomy.ts", import.meta.url), "utf8");

test("Assistant outreach preparation tools are registered once and do not send", () => {
  const names = ["outreach_list_campaigns","outreach_create_campaign","outreach_add_recipient","outreach_add_template","outreach_prepare_campaign"];
  for (const name of names) {
    assert.equal((runtime.match(new RegExp('name: "'+name+'"',"g"))||[]).length,1,name+" definition");
    assert.equal((runtime.match(new RegExp('if \\(name === "'+name+'"\\)',"g"))||[]).length,1,name+" handler");
  }
  for (const id of ["outreach.list_campaigns","outreach.create_campaign","outreach.add_recipient","outreach.add_template","outreach.prepare_campaign"]) {
    assert.ok(registry.includes('id:"'+id+'"'),id+" registry entry");
    assert.match(registry,new RegExp('id:"'+id+'"[^\\n]*state:"available"'));
  }
  assert.match(autonomy,/outreach_list_campaigns: "observe"/);
  assert.match(autonomy,/outreach_create_campaign: "draft"/);
  assert.match(autonomy,/outreach_add_recipient: "draft"/);
  assert.match(autonomy,/outreach_add_template: "draft"/);
  assert.match(autonomy,/outreach_prepare_campaign: "internal_execute"/);
  assert.ok(runtime.includes("provider_send_performed: false"));
  assert.ok(runtime.includes("approved active campaign can be prepared"));
  assert.ok(runtime.includes("marketing_contact_registered=eq.true"));
  assert.ok(!runtime.includes('if (name === "outreach_send")'));
});

test("Partnership campaign creation explicitly applies 50/50 term classification", () => {
  assert.ok(runtime.includes('campaign_kind: { type: "string", enum: ["general","partnership"] }'));
  assert.ok(runtime.includes('"/rest/v1/rpc/gigo_set_outreach_campaign_kind"'));
  assert.ok(runtime.includes('p_campaign_kind: "partnership"'));
  assert.ok(registry.includes("50/50 net revenue terms"));
});
