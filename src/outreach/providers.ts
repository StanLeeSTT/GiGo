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
export const OUTBOUND_PROVIDER_ADAPTERS: readonly OutboundProviderAdapter[] = [];
