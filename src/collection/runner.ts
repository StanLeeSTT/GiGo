import type { CollectionActorDefinition, CollectionAdapter, CollectionExecutionContext, CollectionOutputItem } from "./types";

export interface CollectionRunHooks {
  persistProgress(progress: { pages?: number; items?: number; requests?: number; checkpoint?: Record<string, unknown> }): Promise<void>;
  persistItem(item: CollectionOutputItem): Promise<void>;
}

export interface CollectionRunResult {
  status: "completed" | "partial";
  counters: { pages: number; items: number; requests: number };
  checkpoint?: Record<string, unknown>;
}

export class CollectionExecutionError extends Error {
  code: "INVALID_INPUT" | "ADAPTER_UNSUPPORTED" | "ITEM_LIMIT" | "INVALID_ITEM" | "TIMEOUT" | "ABORTED" | "INVALID_ADAPTER_RESULT";
  constructor(code: CollectionExecutionError["code"], message: string) {
    super(message);
    this.name = "CollectionExecutionError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeCounter(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function validateOutputItem(item: CollectionOutputItem): boolean {
  return isRecord(item)
    && typeof item.itemKey === "string" && item.itemKey.length > 0 && item.itemKey.length <= 512
    && typeof item.sourceType === "string" && item.sourceType.length <= 80
    && typeof item.accessMethod === "string" && item.accessMethod.length <= 80
    && isRecord(item.permissionContext)
    && isRecord(item.record)
    && (item.sourceUrl === undefined || (typeof item.sourceUrl === "string" && item.sourceUrl.length <= 2048))
    && (item.sourcePlatform === undefined || (typeof item.sourcePlatform === "string" && item.sourcePlatform.length <= 80))
    && (item.observedAt === undefined || (typeof item.observedAt === "string" && Number.isFinite(Date.parse(item.observedAt))));
}

/**
 * Bounded adapter runner. It validates the actor input, enforces output limits,
 * propagates cancellation and persists each item/progress update through hooks.
 * Adapters must cooperate with AbortSignal; the runner cannot forcibly stop
 * arbitrary JavaScript that ignores cancellation.
 */
export async function runCollectionActor(
  actor: CollectionActorDefinition,
  input: Record<string, unknown>,
  adapter: CollectionAdapter,
  context: Omit<CollectionExecutionContext, "signal" | "deadlineAt" | "reportProgress" | "emitItem"> & { signal?: AbortSignal },
  hooks: CollectionRunHooks
): Promise<CollectionRunResult> {
  if (!actor.validateInput(input)) throw new CollectionExecutionError("INVALID_INPUT", "Actor input failed validation.");
  if (!adapter.supports(actor.requiredCapabilities)) throw new CollectionExecutionError("ADAPTER_UNSUPPORTED", "The selected adapter does not support every required actor capability.");
  if (!Number.isSafeInteger(actor.maxDurationMs) || actor.maxDurationMs < 1 || actor.maxDurationMs > 300000) {
    throw new CollectionExecutionError("INVALID_INPUT", "Actor duration limit is invalid.");
  }
  if (!Number.isSafeInteger(actor.maxItems) || actor.maxItems < 1 || actor.maxItems > 10000) {
    throw new CollectionExecutionError("INVALID_INPUT", "Actor item limit is invalid.");
  }

  const controller = new AbortController();
  const parentSignal = context.signal;
  const abortFromParent = () => controller.abort(parentSignal?.reason ?? new Error("Collection run cancelled."));
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });

  const deadlineAt = new Date(Date.now() + actor.maxDurationMs).toISOString();
  let emittedItems = 0;
  let persistedPages = 0;
  let persistedRequests = 0;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let timeoutReject: ((reason: Error) => void) | undefined;
  let abortReject: ((reason: Error) => void) | undefined;
  let timedOut = false;

  const timeout = new Promise<never>((_, reject) => { timeoutReject = reject; });
  const aborted = new Promise<never>((_, reject) => { abortReject = reject; });
  const onAbort = () => {
    if (timedOut) return;
    const reason = controller.signal.reason;
    abortReject?.(reason instanceof CollectionExecutionError
      ? reason
      : new CollectionExecutionError("ABORTED", "Collection run was cancelled."));
  };
  controller.signal.addEventListener("abort", onAbort, { once: true });
  timeoutHandle = setTimeout(() => {
    timedOut = true;
    timeoutReject?.(new CollectionExecutionError("TIMEOUT", "Collection actor exceeded its execution deadline."));
    controller.abort(new Error("Collection actor exceeded its execution deadline."));
  }, actor.maxDurationMs);

  const executionContext: CollectionExecutionContext = {
    ...context,
    signal: controller.signal,
    deadlineAt,
    async reportProgress(progress) {
      if (controller.signal.aborted) throw new CollectionExecutionError("ABORTED", "Collection run was cancelled.");
      const pages = progress.pages === undefined ? persistedPages : safeCounter(progress.pages);
      const requests = progress.requests === undefined ? persistedRequests : safeCounter(progress.requests);
      if (pages === undefined || requests === undefined) throw new CollectionExecutionError("INVALID_ADAPTER_RESULT", "Adapter progress counters must be non-negative safe integers.");
      persistedPages = pages;
      persistedRequests = requests;
      await hooks.persistProgress({ pages, requests, items: emittedItems, ...(progress.checkpoint ? { checkpoint: progress.checkpoint } : {}) });
    },
    async emitItem(item) {
      if (controller.signal.aborted) throw new CollectionExecutionError("ABORTED", "Collection run was cancelled.");
      if (!validateOutputItem(item)) throw new CollectionExecutionError("INVALID_ITEM", "Adapter emitted an invalid or incomplete provenance record.");
      if (emittedItems >= actor.maxItems) {
        const limitError = new CollectionExecutionError("ITEM_LIMIT", "Actor exceeded its maximum item count.");
        controller.abort(limitError);
        throw limitError;
      }
      // Reserve synchronously before awaiting persistence so concurrent adapter
      // emissions cannot race past the actor's maximum item count.
      emittedItems += 1;
      await hooks.persistItem(item);
    }
  };

  try {
    if (controller.signal.aborted) throw new CollectionExecutionError("ABORTED", "Collection run was cancelled.");
    const execution = adapter.execute(actor, input, executionContext);
    const result = await Promise.race([execution, timeout, aborted]);
    if (!result || !["completed", "partial"].includes(result.status)
      || !result.counters
      || safeCounter(result.counters.pages) === undefined
      || safeCounter(result.counters.items) === undefined
      || safeCounter(result.counters.requests) === undefined) {
      throw new CollectionExecutionError("INVALID_ADAPTER_RESULT", "Adapter returned an invalid execution result.");
    }
    if (result.counters.items !== emittedItems) {
      throw new CollectionExecutionError("INVALID_ADAPTER_RESULT", "Adapter item count does not match the number of persisted items.");
    }
    if (result.counters.pages < persistedPages || result.counters.requests < persistedRequests) {
      throw new CollectionExecutionError("INVALID_ADAPTER_RESULT", "Final adapter counters cannot be lower than previously persisted progress.");
    }
    const finalCounters = { pages: result.counters.pages, items: emittedItems, requests: result.counters.requests };
    // Persist a final checkpoint/counter snapshot even when the adapter did
    // not emit an intermediate progress event.
    await hooks.persistProgress({
      ...finalCounters,
      ...(result.checkpoint ? { checkpoint: result.checkpoint } : {})
    });
    return {
      status: result.status,
      counters: finalCounters,
      ...(result.checkpoint ? { checkpoint: result.checkpoint } : {})
    };
  } catch (error) {
    if (error instanceof CollectionExecutionError) throw error;
    if (controller.signal.aborted) throw new CollectionExecutionError("ABORTED", "Collection run was cancelled.");
    throw error;
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    controller.signal.removeEventListener("abort", onAbort);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}
