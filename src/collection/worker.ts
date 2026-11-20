import { getCollectionActor } from "./actors";
import { getCollectionAdapter, listRegisteredCollectionAdapters } from "./adapters";
import { CollectionExecutionError, runCollectionActor } from "./runner";
import type { CollectionWorkerStore } from "./store";

export interface CollectionWorkerBatchResult {
  claimed: number;
  completed: number;
  retried: number;
  failed: number;
  skipped: boolean;
}

function errorRecord(error: unknown): Record<string, unknown> {
  if (error instanceof CollectionExecutionError) {
    return { code: error.code, message: error.message };
  }
  return {
    code: "COLLECTION_WORKER_ERROR",
    message: error instanceof Error ? error.message.slice(0, 500) : "Unknown collection worker error."
  };
}

function isPermanentError(error: unknown): boolean {
  return error instanceof CollectionExecutionError
    && ["INVALID_INPUT", "ADAPTER_UNSUPPORTED", "ITEM_LIMIT", "INVALID_ITEM", "INVALID_ADAPTER_RESULT"].includes(error.code);
}

/**
 * Executes a bounded batch using only explicitly registered adapters.
 * This function is not scheduled or exposed by the API yet; it is the
 * orchestration boundary to connect after a provider passes live verification.
 */
export async function runCollectionWorkerBatch(
  store: CollectionWorkerStore,
  options: { limit?: number; leaseSeconds?: number } = {}
): Promise<CollectionWorkerBatchResult> {
  // Fail closed: do not claim durable jobs while no adapter is registered.
  if (listRegisteredCollectionAdapters().length === 0) {
    return { claimed: 0, completed: 0, retried: 0, failed: 0, skipped: true };
  }

  const claims = await store.claim(options.limit ?? 1, options.leaseSeconds ?? 120);
  const result: CollectionWorkerBatchResult = {
    claimed: claims.length,
    completed: 0,
    retried: 0,
    failed: 0,
    skipped: false
  };

  for (const claim of claims) {
    const actor = getCollectionActor(claim.actor_key, claim.actor_version);
    const adapter = getCollectionAdapter(claim.provider_key);

    if (!actor || !adapter) {
      const error = {
        code: !actor ? "UNKNOWN_ACTOR" : "ADAPTER_NOT_REGISTERED",
        message: !actor
          ? "The claimed job references an unregistered actor version."
          : "No verified adapter is registered for the selected provider."
      };
      const retried = await store.retry(claim.job_id, claim.lease_token, error, 900);
      if (retried) result.retried += 1;
      else result.failed += 1;
      continue;
    }

    try {
      const run = await runCollectionActor(
        actor,
        claim.actor_input,
        adapter,
        {
          userId: claim.user_id,
          runId: claim.run_id,
          providerKey: claim.provider_key,
          checkpoint: claim.checkpoint
        },
        {
          async persistProgress(progress) {
            const saved = await store.progress(
              claim.job_id,
              claim.lease_token,
              {
                pages: progress.pages ?? 0,
                items: progress.items ?? 0,
                requests: progress.requests ?? 0
              },
              progress.checkpoint ?? claim.checkpoint
            );
            if (!saved) throw new Error("Collection worker lease was lost while saving progress.");
          },
          async persistItem(item) {
            const outcome = await store.persistItem(claim.job_id, claim.lease_token, item);
            if (outcome === "lease_lost") throw new Error("Collection worker lease was lost while saving an item.");
          }
        }
      );

      const finished = await store.finish(
        claim.job_id,
        claim.lease_token,
        run.status,
        null
      );
      if (!finished) throw new Error("Collection worker lease was lost before finalization.");
      result.completed += 1;
    } catch (error) {
      const details = errorRecord(error);
      if (isPermanentError(error)) {
        const finished = await store.finish(claim.job_id, claim.lease_token, "failed", details);
        if (finished) result.failed += 1;
        else result.retried += 1;
      } else {
        const retried = await store.retry(claim.job_id, claim.lease_token, details, 300);
        if (retried) result.retried += 1;
        else result.failed += 1;
      }
    }
  }

  return result;
}
