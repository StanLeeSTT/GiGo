/**
 * GiGo outbound provider contract.
 *
 * This file intentionally contains no network sender and no credentials.
 * Marketing/partnership outreach must use a provider's marketing channel,
 * not disguise promotional contact as transactional email.
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
    freeTier: {
      monthlyLimit: 3000,
      dailyLimit: 100,
      caveats: ["Marketing broadcasts are distinct from transactional email and are limited to existing contacts."]
    }
  },
  {
    id: "brevo",
    channels: ["transactional_api", "marketing_campaign"],
    marketingRequiresExistingContact: true,
    freeTier: {
      monthlyLimit: null,
      dailyLimit: 300,
      caveats: ["Free plan advertises 300 sends/day; transactional email is defined for non-promotional messages; marketing campaigns use registered contacts and unsubscribe controls."]
    }
  }
] as const;

/** Select a permitted channel; never send promotional/partnership copy through a transactional endpoint. */
export function selectOutboundChannel(
  descriptor: ProviderDescriptor,
  purpose: OutboundPurpose,
  recipientIsRegisteredContact: boolean
): OutboundChannel {
  const requiresMarketing = purpose === "marketing" || purpose === "relationship_outreach";
  const channel: OutboundChannel = requiresMarketing ? "marketing_campaign" : "transactional_api";
  if (!descriptor.channels.includes(channel)) {
    throw new Error("PROVIDER_CHANNEL_NOT_SUPPORTED");
  }
  if (requiresMarketing && descriptor.marketingRequiresExistingContact && !recipientIsRegisteredContact) {
    throw new Error("MARKETING_CONTACT_NOT_REGISTERED");
  }
  return channel;
}

/** Stable provider idempotency key; must be reused with an identical payload on retries. */
export function outboundIdempotencyKey(messageId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(messageId)) {
    throw new Error("INVALID_OUTBOUND_MESSAGE_ID");
  }
  return "gigo-outreach/" + messageId;
}

/** Unknown provider outcomes must never be retried automatically. */
export function mayRetryProviderOutcome(outcome: ProviderOutcome): boolean {
  return outcome.kind === "rejected_before_send" && outcome.retryable;
}

/** No adapter is registered until the user configures a provider and sender. */
export const OUTBOUND_PROVIDER_ADAPTERS: readonly OutboundProviderAdapter[] = [];
