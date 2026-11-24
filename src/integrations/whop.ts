export interface WhopEvent {
  id: string;
  type: string;
  timestamp?: string;
  account_id?: string;
  company_id?: string;
  data: Record<string, unknown>;
}

const TRACKED_EVENTS = new Set([
  "payment.succeeded", "payment.failed",
  "refund.created", "refund.updated",
  "dispute.created", "dispute.updated"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

function decodeBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  } catch {
    return null;
  }
}

/** Verify Whop's Standard Webhooks HMAC using the literal ws_ secret as key. */
export async function verifyWhopWebhook(
  rawBody: string,
  headers: Headers,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<boolean> {
  const messageId = headers.get("webhook-id") ?? "";
  const timestamp = headers.get("webhook-timestamp") ?? "";
  const signatureHeader = headers.get("webhook-signature") ?? "";
  if (!messageId || messageId.length > 200 || !/^\d{1,12}$/.test(timestamp) || !signatureHeader || !secret.startsWith("ws_")) return false;
  const sentAt = Number(timestamp);
  if (!Number.isSafeInteger(sentAt) || Math.abs(nowSeconds - sentAt) > 300) return false;

  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signed = new TextEncoder().encode(messageId + "." + timestamp + "." + rawBody);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, signed));
  for (const entry of signatureHeader.split(/\s+/)) {
    const [version, encoded] = entry.split(",", 2);
    if (version !== "v1" || !encoded) continue;
    const received = decodeBase64(encoded);
    if (received && constantTimeEqual(expected, received)) return true;
  }
  return false;
}

export function parseWhopEvent(value: unknown): WhopEvent | null {
  if (!isRecord(value) || typeof value.id !== "string" || value.id.length < 1 || value.id.length > 200
    || typeof value.type !== "string" || !TRACKED_EVENTS.has(value.type) || !isRecord(value.data)) return null;
  return { id: value.id, type: value.type, timestamp: typeof value.timestamp === "string" ? value.timestamp : undefined, account_id: typeof value.account_id === "string" ? value.account_id : undefined, company_id: typeof value.company_id === "string" ? value.company_id : undefined, data: value.data };
}

function idValue(value: unknown): string | null {
  if (typeof value === "string" && value.length <= 200) return value;
  if (isRecord(value) && typeof value.id === "string" && value.id.length <= 200) return value.id;
  return null;
}

/** Store only reporting fields; never persist full customer/payment payloads or secrets. */
export function toWhopEventRecord(event: WhopEvent, ownerId: string) {
  const data = event.data;
  const metadata = isRecord(data.metadata) ? data.metadata : {};
  const amount = typeof data.amount === "number" || (typeof data.amount === "string" && /^\d+(\.\d{1,6})?$/.test(data.amount))
    ? String(data.amount) : null;
  const occurredAt = event.timestamp && Number.isFinite(Date.parse(event.timestamp)) ? event.timestamp : null;
  return {
    owner_id: ownerId,
    event_id: event.id,
    event_type: event.type,
    payment_id: idValue(data.payment) ?? idValue(data.payment_id) ?? (event.type.startsWith("payment.") ? idValue(data.id) : null),
    resource_id: idValue(data.id),
    product_id: idValue(data.product) ?? idValue(data.product_id),
    plan_id: idValue(data.plan) ?? idValue(data.plan_id),
    partner_id: idValue(data.affiliate) ?? idValue(data.affiliate_id) ?? idValue(data.affiliate_user_id) ?? idValue(metadata.affiliate_id) ?? idValue(metadata.partner_id),
    company_id: event.account_id ?? event.company_id ?? idValue(data.company) ?? idValue(data.company_id),
    amount,
    currency: typeof data.currency === "string" && /^[A-Z]{3}$/.test(data.currency) ? data.currency : null,
    occurred_at: occurredAt,
    safe_metadata: {
      offer_id: idValue(metadata.offer_id),
      partner_id: idValue(metadata.partner_id),
      attribution_id: idValue(metadata.attribution_id)
    }
  };
}
