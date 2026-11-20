-- Service-role-only health gate for the first internal safe-HTTP provider.
-- The health RPC verifies the complete worker RPC surface, not merely this migration.
create or replace function public.gigo_collection_worker_health()
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if to_regprocedure('public.gigo_claim_collection_jobs(integer,integer)') is null
     or to_regprocedure('public.gigo_collection_worker_progress(uuid,uuid,jsonb,jsonb)') is null
     or to_regprocedure('public.gigo_collection_worker_item(uuid,uuid,jsonb)') is null
     or to_regprocedure('public.gigo_finish_collection_job(uuid,uuid,text,jsonb)') is null
     or to_regprocedure('public.gigo_retry_collection_job(uuid,uuid,jsonb,integer)') is null then
    raise exception 'collection worker migrations are incomplete' using errcode = '55000';
  end if;
  return 'gigo-collection-worker-v1';
end;
$$;
revoke all on function public.gigo_collection_worker_health() from public, anon, authenticated;
grant execute on function public.gigo_collection_worker_health() to service_role;

create or replace function public.gigo_set_collection_provider_health(p_provider_id uuid, p_check_version text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_check_version is distinct from 'safe-http-batch-v1' then
    raise exception 'unsupported collection health check' using errcode = '22023';
  end if;
  update public.collection_providers
    set status = 'healthy', last_health_check_at = now(), last_error_code = null
    where id = p_provider_id
      and provider_key = 'gigo_safe_http_batch'
      and status in ('configured', 'degraded', 'healthy')
      and provider_type = 'web_crawl'
      and access_mode = 'public_web_permitted'
      and capabilities @> '["web_fetch"]'::jsonb
      and configuration @> '{"execution_mode":"batch_runner","runner":"github_actions","adapter_key":"gigo_safe_http_batch","adapter_version":1,"network_policy":"public_https_only","authentication":"none"}'::jsonb;
  return found;
end;
$$;
revoke all on function public.gigo_set_collection_provider_health(uuid, text) from public, anon, authenticated;
grant execute on function public.gigo_set_collection_provider_health(uuid, text) to service_role;
