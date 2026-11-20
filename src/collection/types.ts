import type { CollectionCapability, ProviderExecutionMode } from "./registry";

export type CollectionActorCategory =
  | "web_search" | "web_crawl" | "browser_automation" | "social_discovery"
  | "lead_discovery" | "data_extraction" | "market_intelligence" | "custom";

export interface CollectionActorDefinition<TInput = Record<string, unknown>, TOutput = Record<string, unknown>> {
  key: string;
  version: number;
  name: string;
  description: string;
  category: CollectionActorCategory;
  requiredCapabilities: readonly CollectionCapability[];
  policyTags: readonly string[];
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  maxItems: number;
  maxDurationMs: number;
  validateInput(value: unknown): value is TInput;
}

export interface CollectionExecutionContext {
  userId: string;
  runId: string;
  providerKey: string;
  signal: AbortSignal;
  deadlineAt: string;
  checkpoint: Record<string, unknown>;
  reportProgress(progress: { pages?: number; items?: number; requests?: number; checkpoint?: Record<string, unknown> }): Promise<void>;
  emitItem(item: CollectionOutputItem): Promise<void>;
}

export interface CollectionOutputItem {
  itemKey: string;
  sourceUrl?: string;
  sourcePlatform?: string;
  sourceType: string;
  observedAt?: string;
  accessMethod: string;
  permissionContext: Record<string, unknown>;
  record: Record<string, unknown>;
}

export interface CollectionAdapter {
  key: string;
  executionModes: readonly ProviderExecutionMode[];
  supports(capabilities: readonly CollectionCapability[]): boolean;
  execute(
    actor: CollectionActorDefinition,
    input: Record<string, unknown>,
    context: CollectionExecutionContext
  ): Promise<{ status: "completed" | "partial"; counters: { pages: number; items: number; requests: number }; checkpoint?: Record<string, unknown> }>;
}
