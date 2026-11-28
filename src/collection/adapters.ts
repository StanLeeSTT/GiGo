import type { CollectionAdapter } from "./types";

/**
 * Adapters are registered explicitly. An empty registry is intentional:
 * catalogue entries do not imply a provider is connected or safe to execute.
 */
const adapters = new Map<string, CollectionAdapter>();

export function registerCollectionAdapter(adapter: CollectionAdapter): void {
  if (!/^[a-z][a-z0-9_-]{1,63}$/.test(adapter.key)) throw new Error("Invalid collection adapter key.");
  if (adapters.has(adapter.key)) throw new Error("A collection adapter with this key is already registered.");
  adapters.set(adapter.key, adapter);
}

export function getCollectionAdapter(key: string): CollectionAdapter | null {
  return adapters.get(key) ?? null;
}

export function listRegisteredCollectionAdapters(): string[] {
  return Array.from(adapters.keys()).sort();
}

export function clearCollectionAdaptersForTests(): void {
  adapters.clear();
}
