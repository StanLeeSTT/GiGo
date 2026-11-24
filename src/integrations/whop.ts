export interface WhopSalesEvent {
  eventId: string;
  eventType: "payment.succeeded" | "payment.failed" | "refund.created" | "dispute.created";
  paymentId: string | null;
  productId: string | null;
  planId: string | null;
  partnerId: string | null;
  amount: number | null;
  currency: string | null;
  paymentStatus: string | null;
  occurredAt: string | null;
  safeMetadata: Record<string, string | number | boolean | null>;
}

const SUPPORTED_EVENTS = new Set(["payment.succeeded", "payment.failed", "refund.created", "dispute.created"]);

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

function decodeBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, char => char.charCodeAt(0));
  } catch { return null; }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function secretKeyCandidates(secret: string): Uint8Array[] {
  const candidates: Uint8Array[] = [];
  if (secret.startsWith("whsec_")) {
    const decoded = decodeBase64(secret.slice(6));
    if (decoded?.length) candidates.push(decoded);
  } else if (secret.startsWith("ws_")) {
    // Whop has used a distinct ws_ webhook-secret prefix. Accept its exact
    // bytes and a base64 payload form without ever logging or exposing it.
    candidates.push(new TextEncoder().encode(secret));
    const decoded = decodeBase64(secret.slice(3));
    if (decoded?.length) candidates.push(decoded);
  }
  return candidates;
}

export async function verifyWhopWebhook(request: Request, rawBody: string, secret: string, nowMs = Date.now()): Promise<boolean> {
  if (!secret || secret.length > 512 || rawBody.length > 256 * 1024) return false;
  const messageId = request.headers.get("webhook-id") ?? "";
  const timestampText = request.headers.get("webhook-timestamp") ?? "";
  const signatureHeader = request.headers.get("webhook-signature") ?? "";
  const timestamp = Number(timestampText);
  if (!messageId || messageId.length > 200 || !/^\d{1,12}$/.test(timestampText)
    || !Number.isSafeInteger(timestamp) || Math.abs(nowMs / 1000 - timestamp) > 300
    || !signatureHeader || signatureHeader.length > 4000) return false;

  const signed = new TextEncoder().encode(messageId + "." + timestampText + "." + rawBody);
  const signatures = signatureHeader.split(/\s+/).filter(part => part.startsWith("v1,")).map(part => part.slice(3));
  if (!signatures.length) return false;
  for (const keyBytes of secretKeyCandidates(secret)) {
    try {
      const key = await crypto.subtle.importKey("raw", toArrayBuffer(keyBytes), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const expected = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, toArrayBuffer(signed)))));
      if (signatures.some(signature => constantTimeEqual(signature, expected))) return true;
    } catch { /* Fail closed for unsupported key material. */ }
  }
  return false;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function scalarId(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0 && value.length <= 200) return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  return null;
}
function nestedId(value: unknown): string | null {
  const item = record(value);
  return scalarId(item.id);
}
function amountValue(data: Record<string, unknown>): number | null {
  for (const key of ["amount", "final_amount", "total", "price"]) {
    const value = data[key];
    const text = typeof value === "number" && Number.isFinite(value) ? String(value) : typeof value === "string" ? value : "";
    if (text.length <= 20 && /^(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/.test(text)) return Number(text);
  }
  return null;
}

export function normalizeWhopSalesEvent(eventId: string, payload: unknown): WhopSalesEvent | null {
  if (!eventId || eventId.length > 200) return null;
  const root = record(payload);
  const eventType = typeof root.type === "string" ? root.type : typeof root.event === "string" ? root.event : "";
  if (!SUPPORTED_EVENTS.has(eventType)) return null;
  const data = record(root.data);
  const payment = record(data.payment);
  const affiliate = record(data.affiliate);
  const occurredRaw = root.timestamp ?? data.created_at ?? data.updated_at;
  const occurredAt = typeof occurredRaw === "string" && Number.isFinite(Date.parse(occurredRaw)) ? new Date(occurredRaw).toISOString() : null;
  const currencyRaw = data.currency;
  const statusRaw = data.status;
  const partnerId = nestedId(data.affiliate) ?? scalarId(data.affiliate_id) ?? scalarId(data.partner_id);
  const safeMetadata: WhopSalesEvent["safeMetadata"] = {};
  const metadata = record(data.metadata);
  for (const key of ["campaign_id", "source", "partner_code"]) {
    const value = metadata[key];
    if (typeof value === "string" && value.length <= 160) safeMetadata[key] = value;
  }
  if (affiliate.id && !partnerId) safeMetadata.partner_attribution_present = true;

  return {
    eventId,
    eventType: eventType as WhopSalesEvent["eventType"],
    paymentId: scalarId(data.payment_id) ?? nestedId(data.payment) ?? (eventType.startsWith("payment.") ? scalarId(data.id) : null),
    productId: scalarId(data.product_id) ?? nestedId(data.product),
    planId: scalarId(data.plan_id) ?? nestedId(data.plan),
    partnerId,
    amount: amountValue(data),
    currency: typeof currencyRaw === "string" && /^[A-Za-z]{3,12}$/.test(currencyRaw) ? currencyRaw.toUpperCase() : null,
    paymentStatus: typeof statusRaw === "string" && statusRaw.length <= 40 ? statusRaw : null,
    occurredAt,
    safeMetadata
  };
}
