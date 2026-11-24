import test from "node:test";
import assert from "node:assert/strict";
import { normalizeWhopSalesEvent, verifyWhopWebhook } from "../src/integrations/whop.ts";

async function signedRequest(body, secret, now = Math.floor(Date.now() / 1000)) {
  const id = "msg_test_123";
  const timestamp = String(now);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const message = new TextEncoder().encode(id + "." + timestamp + "." + body);
  const signature = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, message))));
  return new Request("https://gigo.example/api/v1/webhooks/whop", {
    method: "POST",
    headers: { "webhook-id": id, "webhook-timestamp": timestamp, "webhook-signature": "v1," + signature },
    body
  });
}

test("Whop webhook verifier validates the raw signed body and rejects stale timestamps", async () => {
  const secret = "ws_test_webhook_secret";
  const body = JSON.stringify({ type: "payment.succeeded", data: { id: "pay_123", amount: 12.5, currency: "usd" } });
  const request = await signedRequest(body, secret);
  assert.equal(await verifyWhopWebhook(request, body, secret), true);
  assert.equal(await verifyWhopWebhook(request, body + " ", secret), false);
  assert.equal(await verifyWhopWebhook(request, body, secret, Date.now() + 10 * 60 * 1000), false);
});

test("Whop event normalizer stores only allowlisted sales facts", () => {
  const event = normalizeWhopSalesEvent("msg_1", {
    type: "payment.succeeded",
    timestamp: "2026-11-24T12:00:00.000Z",
    data: {
      id: "pay_1",
      product: { id: "prod_1" },
      plan: { id: "plan_1" },
      affiliate: { id: "aff_1" },
      amount: 20,
      currency: "usd",
      status: "paid",
      customer: { email: "private@example.com" },
      metadata: { campaign_id: "campaign_1", private_note: "do not store" }
    }
  });
  assert.ok(event);
  assert.equal(event.paymentId, "pay_1");
  assert.equal(event.partnerId, "aff_1");
  assert.equal(event.amount, 20);
  assert.deepEqual(event.safeMetadata, { campaign_id: "campaign_1" });
  assert.equal("customer" in event, false);
  assert.equal(normalizeWhopSalesEvent("msg_2", { type: "payment.succeeded", data: { id: "pay_2", amount: "99999999999999999999", currency: "usd" } }).amount, null);
  assert.equal(normalizeWhopSalesEvent("msg_2", { type: "membership.activated", data: {} }), null);
});
