import type { CollectionCapability, CollectionProviderDefinition } from "./registry";

export interface ConnectedCollectionProvider {
  id: string;
  provider_key: string;
  status: "not_configured" | "configured" | "healthy" | "degraded" | "disabled" | "quota_exhausted" | "permission_required" | "error";
  capabilities: unknown;
  quota_state?: Record<string, unknown> | null;
}

export interface CollectionProviderCandidate {
  providerKey: string;
  name: string;
  ready: boolean;
  reason: string;
  verification: CollectionProviderDefinition["verification"];
  providerId?: string;
}

const blockedStatuses = new Set(["not_configured", "disabled", "quota_exhausted", "permission_required", "error"]);
const verificationRank: Record<CollectionProviderDefinition["verification"], number> = {
  official_api: 0,
  verified_open_source: 1,
  integration_scaffold: 2,
  candidate_unverified: 3
};

function hasCapabilities(actual: unknown, required: readonly CollectionCapability[]): boolean {
  if (!Array.isArray(actual)) return false;
  const values = new Set(actual.filter((value): value is string => typeof value === "string"));
  return required.every((capability) => values.has(capability));
}

/**
 * Selects only explicitly connected, healthy providers with verified capability
 * declarations. This is a planning function; it does not execute network work.
 */
export function planCollectionProviders(
  required: readonly CollectionCapability[],
  catalogue: readonly CollectionProviderDefinition[],
  connected: readonly ConnectedCollectionProvider[]
): CollectionProviderCandidate[] {
  const byKey = new Map(connected.map((provider) => [provider.provider_key, provider]));
  return catalogue
    .filter((definition) => required.every((capability) => definition.capabilities.includes(capability)))
    .map((definition): CollectionProviderCandidate => {
      const configured = byKey.get(definition.key);
      if (definition.verification === "candidate_unverified" || definition.verification === "integration_scaffold") {
        const reason = definition.verification === "candidate_unverified"
          ? "Provider identity, permissions or service terms have not been verified."
          : "GiGo integration exists only as scaffolding; the external service is not connected and tested.";
        return { providerKey: definition.key, name: definition.name, ready: false, reason, verification: definition.verification };
      }
      if (!configured) {
        return { providerKey: definition.key, name: definition.name, ready: false, reason: "Provider has not been configured by the owner.", verification: definition.verification };
      }
      if (blockedStatuses.has(configured.status)) {
        return { providerKey: definition.key, name: definition.name, ready: false, reason: "Provider status is " + configured.status + ".", verification: definition.verification, providerId: configured.id };
      }
      if (configured.status !== "healthy") {
        return { providerKey: definition.key, name: definition.name, ready: false, reason: "Provider health has not been confirmed.", verification: definition.verification, providerId: configured.id };
      }
      if (!hasCapabilities(configured.capabilities, required)) {
        return { providerKey: definition.key, name: definition.name, ready: false, reason: "Connected provider record does not grant every required capability.", verification: definition.verification, providerId: configured.id };
      }
      return { providerKey: definition.key, name: definition.name, ready: true, reason: "Healthy provider with verified capability coverage.", verification: definition.verification, providerId: configured.id };
    })
    .sort((a, b) => Number(b.ready) - Number(a.ready) || verificationRank[a.verification] - verificationRank[b.verification] || a.providerKey.localeCompare(b.providerKey));
}
