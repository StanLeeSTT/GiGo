import test from "node:test";
import assert from "node:assert/strict";
import { parseWhopEvent, toWhopEventRecord, verifyWhopWebhook } from "../src/integrations/whop.ts";

async function signedHeaders(body, secret, id = "msg_test", timestamp = String(Math.floor(Date.now()/1000))) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(id + "." + timestamp + "." + body)));
  let binary = "";
  for (const byte of signature) binary += String.fromCharCode(byte);
  return new Headers({
    "webhook-id": id,
    "webhook-timestamp": timestamp,
    "webhook-signature": "v1," + btoa(binary)
  });
}

test("Whop signature verification uses raw body and literal ws_ key", async () => {
  const secret = "ws_test_secret_123456";
  const body = JSON.stringify({ id: "msg_test", type: "payment.succeeded", data: { id: "pay_1" } });
  const headers = await signedHeaders(body, secret);
  assert.equal(await verifyWhopWebhook(body, headers, secret), true);
  assert.equal(await verifyWhopWebhook(body + " ", headers, secret), false);
});

test("Whop rejects invalid signatures and stale timestamps", async () => {
  const secret = "ws_test_secret_123456";
  const body = "{}";
  const stale = await signedHeaders(body, secret, "msg_old", String(Math.floor(Date.now()/1000)-600));
  assert.equal(await verifyWhopWebhook(body, stale, secret), false);
  assert.equal(await verifyWhopWebhook(body, new Headers(), secret), false);
});

test("Whop parser accepts only supported sales lifecycle events", () => {
  assert.equal(parseWhopEvent({ id: "msg_1", type: "payment.succeeded", data: { id: "pay_1" } }).id, "msg_1");
  assert.equal(parseWhopEvent({ id: "msg_2", type: "payout.created", data: { id: "po_1" } }), null);
  assert.equal(parseWhopEvent({ id: "msg_3", type: "payment.succeeded", data: [] }), null);
});

test("Whop reporting record contains partner and sales fields but excludes customer PII", () => {
  const event = parseWhopEvent({
    id: "msg_1", type: "payment.succeeded", timestamp: "2026-11-24T10:00:00.000Z",
    data: { id: "pay_1", amount: "49.99", currency: "USD", product: { id: "prod_1" }, affiliate_id: "aff_1",
      customer: { id: "mem_1", email: "private@example.com" }, metadata: { offer_id: "offer_1" } }
  });
  const row = toWhopEventRecord(event, "owner-uuid");
  assert.equal(row.payment_id, "pay_1");
  assert.equal(row.product_id, "prod_1");
  assert.equal(row.partner_id, "aff_1");
  assert.equal(row.amount, "49.99");
  assert.equal(row.safe_metadata.offer_id, "offer_1");
  assert.equal(JSON.stringify(row).includes("private@example.com"), false);
});
