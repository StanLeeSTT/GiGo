import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../public/commerce.html", import.meta.url), "utf8");
const client = readFileSync(new URL("../public/commerce.js", import.meta.url), "utf8");

test("Commerce Planning reads existing product and offer assumptions", () => {
  assert.ok(page.includes("commerce-products"));
  assert.ok(page.includes("commerce-offers"));
  assert.ok(client.includes("/api/v1/products"));
  assert.ok(client.includes("/api/v1/offers"));
  assert.ok(client.includes("net_before_tax_estimate"));
  assert.ok(client.includes("estimate_available"));
});

test("Commerce Planning clearly preserves the owner's financial hard deny", () => {
  assert.ok(page.includes("Financial execution is permanently disabled."));
  for (const term of ["accept payments","issue refunds","transfer money","purchase services","invest"]) assert.ok(page.includes(term));
  assert.ok(page.includes("You retain all monetary actions."));
  assert.ok(client.includes("No transactions are processed."));
});
