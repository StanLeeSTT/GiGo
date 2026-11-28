import { getCollectionActor } from "./actors.ts";
import { getCollectionAdapter, listRegisteredCollectionAdapters } from "./adapters.ts";
import { CollectionExecutionError, runCollectionActor } from "./runner.ts";
import type { CollectionWorkerStore } from "./store";

export interface CollectionWorkerBatchResult {
  claimed: number;
  completed: number;
  retried: number;
  failed: number;
  cancelled: number;
  skipped: boolean;
}

function errorRecord(error: unknown): Record<string, unknown> {
  if (error instanceof CollectionExecutionError) return { code: error.code, message: error.message };
  return { code: "COLLECTION_WORKER_ERROR", message: error instanceof Error ? error.message.slice(0, 500) : "Unknown collection worker error." };
}

function isPermanentError(error: unknown): boolean {
  return error instanceof CollectionExecutionError
    && ["INVALID_INPUT", "ADAPTER_UNSUPPORTED", "ITEM_LIMIT", "INVALID_ITEM", "INVALID_ADAPTER_RESULT"].includes(error.code);
}

export async function runCollectionWorkerBatch(
  store: CollectionWorkerStore,
  options: { limit?: number; leaseSeconds?: number; heartbeatIntervalMs?: number } = {}
): Promise<CollectionWorkerBatchResult> {
  if (listRegisteredCollectionAdapters().length === 0) {
    return { claimed: 0, completed: 0, retried: 0, failed: 0, cancelled: 0, skipped: true };
  }
  const leaseSeconds = options.leaseSeconds ?? 120;
  const claims = await store.claim(options.limit ?? 1, leaseSeconds);
  const result: CollectionWorkerBatchResult = { claimed: claims.length, completed: 0, retried: 0, failed: 0, cancelled: 0, skipped: false };

  for (const claim of claims) {
    const actor = getCollectionActor(claim.actor_key, claim.actor_version);
    const adapter = getCollectionAdapter(claim.provider_key);
    if (!actor || !adapter) {
      const outcome = await store.retry(claim.job_id, claim.lease_token, {
        code: !actor ? "UNKNOWN_ACTOR" : "ADAPTER_NOT_REGISTERED",
        message: !actor ? "The claimed job references an unregistered actor version." : "No verified adapter is registered for the selected provider."
      }, 900);
      if (outcome === "retry_scheduled") result.retried++;
      else if (outcome === "failed") result.failed++;
      continue;
    }

    const controller = new AbortController();
    const intervalMs = options.heartbeatIntervalMs ?? 30000;
    let heartbeatInFlight: Promise<void> | null = null;
    let heartbeatFailed = false;
    let cancellationRequested = false;
    const heartbeatTimer = setInterval(() => {
      if (heartbeatInFlight || controller.signal.aborted) return;
      heartbeatInFlight = (async () => {
        try {
          const heartbeat = await store.heartbeat(claim.job_id, claim.lease_token);
          if (heartbeat === "cancel_requested") {
            cancellationRequested = true;
            controller.abort(new Error("Collection cancellation was requested."));
          } else if (heartbeat === "lease_lost") {
            heartbeatFailed = true;
            controller.abort(new Error("Collection worker lease was lost."));
          }
        } catch {
          heartbeatFailed = true;
          controller.abort(new Error("Collection worker heartbeat failed."));
        } finally {
          heartbeatInFlight = null;
        }
      })();
    }, intervalMs);
    const timer = heartbeatTimer as ReturnType<typeof setInterval> & { unref?: () => void };
    timer.unref?.();

    try {
      const run = await runCollectionActor(
        actor,
        claim.actor_input,
        adapter,
        { userId: claim.user_id, runId: claim.run_id, providerKey: claim.provider_key, checkpoint: claim.checkpoint, signal: controller.signal, reserveProviderUsage: (units = 1) => store.reserveProviderUsage(claim.job_id, claim.lease_token, units) },
        {
          async persistProgress(progress) {
            const saved = await store.progress(claim.job_id, claim.lease_token, {
              pages: progress.pages ?? 0, items: progress.items ?? 0, requests: progress.requests ?? 0
            }, progress.checkpoint ?? claim.checkpoint);
            if (!saved) throw new Error("Collection worker lease was lost while saving progress.");
          },
          async persistItem(item) {
            const outcome = await store.persistItem(claim.job_id, claim.lease_token, item);
            if (outcome === "lease_lost") throw new Error("Collection worker lease was lost while saving an item.");
          }
        }
      );
      if (heartbeatFailed) throw new Error("Collection worker heartbeat failed.");
      if (cancellationRequested) {
        const finished = await store.finish(claim.job_id, claim.lease_token, "cancelled", null);
        if (finished) result.cancelled++;
        else result.retried++;
      } else {
        const finished = await store.finish(claim.job_id, claim.lease_token, run.status, null);
        if (!finished) throw new Error("Collection worker lease was lost before finalization.");
        result.completed++;
      }
    } catch (error) {
      if (cancellationRequested) {
        const finished = await store.finish(claim.job_id, claim.lease_token, "cancelled", null);
        if (finished) result.cancelled++;
        else result.retried++;
      } else {
      const details = heartbeatFailed
        ? { code: "LEASE_HEARTBEAT_FAILED", message: "The collection worker could not renew its lease; the run will be resumed safely." }
        : errorRecord(error);
      if (isPermanentError(error)) {
        const finished = await store.finish(claim.job_id, claim.lease_token, "failed", details);
        if (finished) result.failed++;
        else result.retried++;
      } else {
        const outcome = await store.retry(claim.job_id, claim.lease_token, details, 300);
        if (outcome === "retry_scheduled") result.retried++;
        else if (outcome === "failed") result.failed++;
      }
      }
    } finally {
      clearInterval(heartbeatTimer);
      if (heartbeatInFlight) await heartbeatInFlight;
    }
  }
  return result;
}
