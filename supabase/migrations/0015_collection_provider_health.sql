-- Service-role-only health gate for the first internal safe-HTTP provider.
create or replace function public.gigo_collection_worker_health()
returns text language sql security definer set search_path = ''
as $$ select 'gigo-collection-worker-v1'::text; $$;
revoke all on function public.gigo_collection_worker_health() from public, anon, authenticated;
grant execute on function public.gigo_collection_worker_health() to service_role;

create or replace function public.gigo_set_collection_provider_health(p_provider_id uuid, p_check_version text)
returns boolean language plpgsql security definer set search_path = ''
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
