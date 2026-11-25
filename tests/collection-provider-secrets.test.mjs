import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const batchWorkflow = readFileSync(new URL("../.github/workflows/collection-batch.yml", import.meta.url), "utf8");
const healthWorkflow = readFileSync(new URL("../.github/workflows/collection-provider-health.yml", import.meta.url), "utf8");

test("Apify and Decodo credentials are passed only to the trusted feature-branch batch runner", () => {
  assert.match(batchWorkflow, /workflow_dispatch:/);
  assert.match(batchWorkflow, /github\.ref == 'refs\/heads\/feat\/universal-collection-engine'/);
  assert.match(batchWorkflow, /APIFY_API_TOKEN:\s*\$\{\{\s*secrets\.APIFY_API_TOKEN\s*\}\}/);
  assert.match(batchWorkflow, /DECODO_API_KEY:\s*\$\{\{\s*secrets\.DECODO_API_KEY\s*\}\}/);
  assert.match(batchWorkflow, /node --experimental-strip-types scripts\/collection-batch-worker\.mjs/);
});

test("provider health workflow does not need or receive paid scraper credentials", () => {
  assert.doesNotMatch(healthWorkflow, /APIFY_API_TOKEN|DECODO_API_KEY/);
});
