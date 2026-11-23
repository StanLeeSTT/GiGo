/**
 * GiGo outbound provider contract.
 * No sender or credentials are configured in this module.
 */
export type OutboundPurpose = "transactional" | "marketing" | "relationship_outreach";
export type OutboundChannel = "transactional_api" | "marketing_campaign";
export type ProviderOutcome =
  | { kind: "accepted"; providerMessageId: string }
  | { kind: "rejected_before_send"; code: string; message: string; retryable: boolean }
  | { kind: "unknown"; code: string; message: string };

export interface OutboundMessage {
  id: string;
  recipientId: string;
  to: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
  subject: string;
  text: string;
}

export interface ProviderDescriptor {
  id: "resend" | "brevo";
  channels: readonly OutboundChannel[];
  marketingRequiresExistingContact: boolean;
  freeTier: {
    monthlyLimit: number | null;
    dailyLimit: number | null;
    caveats: readonly string[];
  };
}

export interface OutboundProviderAdapter {
  readonly descriptor: ProviderDescriptor;
  send(input: OutboundMessage, channel: OutboundChannel, idempotencyKey: string): Promise<ProviderOutcome>;
  verifyWebhook(request: Request, rawBody: string): Promise<boolean>;
}

export const PROVIDER_CATALOGUE: readonly ProviderDescriptor[] = [
  {
    id: "resend",
    channels: ["transactional_api", "marketing_campaign"],
    marketingRequiresExistingContact: true,
    freeTier: { monthlyLimit: 3000, dailyLimit: 100, caveats: ["Marketing broadcasts are separate from transactional email and limited to existing contacts."] }
  },
  {
    id: "brevo",
    channels: ["transactional_api", "marketing_campaign"],
    marketingRequiresExistingContact: true,
    freeTier: { monthlyLimit: null, dailyLimit: 300, caveats: ["Free plan advertises 300 sends/day; transactional email is for non-promotional messages; marketing campaigns use registered contacts and unsubscribe controls."] }
  }
] as const;

/** Promotional and partnership outreach must never be disguised as transactional mail. */
export function selectOutboundChannel(
  descriptor: ProviderDescriptor,
  purpose: OutboundPurpose,
  recipientIsRegisteredContact: boolean
): OutboundChannel {
  const marketing = purpose === "marketing" || purpose === "relationship_outreach";
  const channel: OutboundChannel = marketing ? "marketing_campaign" : "transactional_api";
  if (!descriptor.channels.includes(channel)) throw new Error("PROVIDER_CHANNEL_NOT_SUPPORTED");
  if (marketing && descriptor.marketingRequiresExistingContact && !recipientIsRegisteredContact) {
    throw new Error("MARKETING_CONTACT_NOT_REGISTERED");
  }
  return channel;
}

export function outboundIdempotencyKey(messageId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(messageId)) {
    throw new Error("INVALID_OUTBOUND_MESSAGE_ID");
  }
  return "gigo-outreach/" + messageId;
}

/** Only explicit provider-confirmed pre-send failures are eligible for automatic retry. */
export function mayRetryProviderOutcome(outcome: ProviderOutcome): boolean {
  return outcome.kind === "rejected_before_send" && outcome.retryable;
}

/** Adapters remain empty until a provider and compliant sender setup are explicitly configured. */

export interface ResendAdapterConfig {
  apiKey: string;
  webhookSecret?: string;
  fetchImpl?: typeof fetch;
}

function validEmail(value: string): boolean {
  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value) && value.length <= 320;
}

function base64Bytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function base64Text(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function constantTimeTextEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

/**
 * Builds a Resend adapter for explicit server-side use.
 * It is deliberately not added to OUTBOUND_PROVIDER_ADAPTERS: no sender is
 * activated until the durable campaign worker and owner approval gates exist.
 */
export function createResendAdapter(config: ResendAdapterConfig): OutboundProviderAdapter {
  const apiKey = config.apiKey.trim();
  const webhookSecret = config.webhookSecret?.trim() ?? "";
  const fetchImpl = config.fetchImpl ?? fetch;
  if (!apiKey || apiKey.length > 500) throw new Error("RESEND_API_KEY_REQUIRED");

  const descriptor = PROVIDER_CATALOGUE.find(item => item.id === "resend")!;
  return {
    descriptor,
    async send(input, channel, idempotencyKey): Promise<ProviderOutcome> {
      if (!descriptor.channels.includes(channel)) {
        return { kind: "rejected_before_send", code: "PROVIDER_CHANNEL_NOT_SUPPORTED", message: "Resend does not support this channel.", retryable: false };
      }
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id) ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.recipientId) ||
          !validEmail(input.to) || !validEmail(input.fromEmail) ||
          (input.replyTo !== undefined && !validEmail(input.replyTo)) ||
          !input.fromName.trim() || /[\\r\\n]/.test(input.fromName) ||
          !input.subject.trim() || input.subject.length > 80 || /[\\r\\n]/.test(input.subject) ||
          !input.text.trim() || input.text.length > 500 ||
          !input.text.trimEnd().endsWith("— STANLEE") ||
          idempotencyKey !== outboundIdempotencyKey(input.id)) {
        return { kind: "rejected_before_send", code: "OUTBOUND_MESSAGE_VALIDATION_FAILED", message: "Message identity, recipient, sender, subject, size, signature or idempotency validation failed.", retryable: false };
      }

      const payload: Record<string, unknown> = {
        from: input.fromName.trim() + " <" + input.fromEmail.toLowerCase() + ">",
        to: [input.to.toLowerCase()],
        subject: input.subject.trim(),
        text: input.text.trimEnd()
      };
      if (input.replyTo) payload.reply_to = input.replyTo.toLowerCase();

      try {
        const response = await fetchImpl("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            authorization: "Bearer " + apiKey,
            "content-type": "application/json",
            "idempotency-key": idempotencyKey
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000)
        });
        const responseBody = await response.json().catch(() => ({})) as Record<string, unknown>;
        if (response.ok && typeof responseBody.id === "string" && responseBody.id.length > 0) {
          return { kind: "accepted", providerMessageId: responseBody.id };
        }
        if (response.status === 429) {
          return { kind: "rejected_before_send", code: "PROVIDER_RATE_LIMITED", message: "Resend rejected the request before acceptance. Respect its retry window and account limits.", retryable: true };
        }
        if (response.status >= 400 && response.status < 500) {
          return { kind: "rejected_before_send", code: "PROVIDER_REQUEST_REJECTED", message: "Resend rejected the request before acceptance.", retryable: false };
        }
        return { kind: "unknown", code: "PROVIDER_ACCEPTANCE_UNKNOWN", message: "Resend did not provide a definitive acceptance result. Do not automatically retry an uncertain send." };
      } catch {
        return { kind: "unknown", code: "PROVIDER_NETWORK_OUTCOME_UNKNOWN", message: "The connection ended without a definitive provider result. Do not automatically retry an uncertain send." };
      }
    },
    async verifyWebhook(request, rawBody): Promise<boolean> {
      if (!webhookSecret.startsWith("whsec_") || rawBody.length > 1024 * 1024) return false;
      const messageId = request.headers.get("svix-id") ?? "";
      const timestampText = request.headers.get("svix-timestamp") ?? "";
      const signatureHeader = request.headers.get("svix-signature") ?? "";
      const timestamp = Number(timestampText);
      if (!messageId || messageId.length > 200 || !Number.isInteger(timestamp) || !signatureHeader || signatureHeader.length > 2000) return false;
      if (Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
      try {
        const key = await crypto.subtle.importKey(
          "raw",
          base64Bytes(webhookSecret.slice("whsec_".length)),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"]
        );
        const signedPayload = new TextEncoder().encode(messageId + "." + timestampText + "." + rawBody);
        const signature = base64Text(new Uint8Array(await crypto.subtle.sign("HMAC", key, signedPayload)));
        return signatureHeader.split(" ").some(candidate => candidate.startsWith("v1,") && constantTimeTextEqual(candidate.slice(3), signature));
      } catch {
        return false;
      }
    }
  };
}

export const OUTBOUND_PROVIDER_ADAPTERS: readonly OutboundProviderAdapter[] = [];
