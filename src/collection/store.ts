import type { CollectionOutputItem } from "./types";

export interface CollectionWorkerClaim {
  job_id: string;
  user_id: string;
  run_id: string;
  dataset_id: string;
  actor_key: string;
  actor_version: number;
  provider_key: string;
  actor_input: Record<string, unknown>;
  checkpoint: Record<string, unknown>;
  attempts: number;
  lease_token: string;
  lease_expires_at: string;
}

export interface CollectionWorkerStore {
  claim(limit?: number, leaseSeconds?: number): Promise<CollectionWorkerClaim[]>;
  progress(jobId: string, leaseToken: string, counters: { pages: number; items: number; requests: number }, checkpoint: Record<string, unknown>): Promise<boolean>;
  persistItem(jobId: string, leaseToken: string, item: CollectionOutputItem): Promise<"inserted" | "duplicate" | "lease_lost">;
  finish(jobId: string, leaseToken: string, status: "completed" | "partial" | "failed" | "cancelled", error?: Record<string, unknown> | null): Promise<boolean>;
  retry(jobId: string, leaseToken: string, error: Record<string, unknown>, delaySeconds?: number): Promise<"retry_scheduled" | "failed" | "lease_lost">;
}

export interface CollectionWorkerStoreConfig {
  supabaseUrl: string;
  serviceKey: string;
  fetcher?: typeof fetch;
}

/**
 * Service-role-only PostgREST client for the collection worker RPC boundary.
 * Supabase sb_secret_* keys are sent as apikey only, never as Bearer JWTs.
 * The service key must remain in the server-side Worker environment.
 */
export function createCollectionWorkerStore(config: CollectionWorkerStoreConfig): CollectionWorkerStore {
  const baseUrl = config.supabaseUrl.replace(/\/+$/, "");
  const fetcher = config.fetcher ?? fetch;
  if (!/^https:\/\//i.test(baseUrl) || !config.serviceKey) {
    throw new Error("Collection worker database configuration is invalid.");
  }

  async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
    const headers: Record<string, string> = {
      apikey: config.serviceKey,
      accept: "application/json",
      "content-type": "application/json"
    };
    if (!config.serviceKey.startsWith("sb_secret_")) headers.authorization = "Bearer " + config.serviceKey;
    let response: Response;
    try {
      response = await fetcher(baseUrl + "/rest/v1/rpc/" + name, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000)
      });
    } catch {
      throw new Error("Collection worker database is temporarily unavailable.");
    }
    if (!response.ok) {
      // Do not include provider response bodies: they may contain sensitive
      // schema details and must never be echoed into job logs or user output.
      throw new Error("Collection worker database request failed (" + response.status + ").");
    }
    try {
      return await response.json() as T;
    } catch {
      throw new Error("Collection worker database returned an invalid response.");
    }
  }

  return {
    async claim(limit = 1, leaseSeconds = 120) {
      const result = await rpc<CollectionWorkerClaim[]>("gigo_claim_collection_jobs", {
        p_limit: limit,
        p_lease_seconds: leaseSeconds
      });
      if (!Array.isArray(result)) throw new Error("Collection worker claim returned an invalid result.");
      return result;
    },
    progress(jobId, leaseToken, counters, checkpoint) {
      return rpc<boolean>("gigo_collection_worker_progress", {
        p_job_id: jobId,
        p_lease_token: leaseToken,
        p_counters: counters,
        p_checkpoint: checkpoint
      });
    },
    persistItem(jobId, leaseToken, item) {
      return rpc<"inserted" | "duplicate" | "lease_lost">("gigo_collection_worker_item", {
        p_job_id: jobId,
        p_lease_token: leaseToken,
        p_item: {
          itemKey: item.itemKey,
          sourceUrl: item.sourceUrl,
          sourcePlatform: item.sourcePlatform,
          sourceType: item.sourceType,
          observedAt: item.observedAt,
          accessMethod: item.accessMethod,
          permissionContext: item.permissionContext,
          record: item.record
        }
      });
    },
    finish(jobId, leaseToken, status, error = null) {
      return rpc<boolean>("gigo_finish_collection_job", {
        p_job_id: jobId,
        p_lease_token: leaseToken,
        p_status: status,
        p_error: error
      });
    },
    retry(jobId, leaseToken, error, delaySeconds = 300) {
      return rpc<"retry_scheduled" | "failed" | "lease_lost">("gigo_retry_collection_job", {
        p_job_id: jobId,
        p_lease_token: leaseToken,
        p_error: error,
        p_delay_seconds: delaySeconds
      });
    }
  };
}
