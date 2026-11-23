-- ============================================================================
-- BEGIN CANONICAL MIGRATION 0046_decodo_web_data_api.sql
-- ============================================================================
-- Decodo Web Data API provider support. Credentials remain in DECODO_API_KEY in the trusted worker environment.
create or replace function public.gigo_create_collection_run(p_actor_key text,p_actor_version integer,p_input jsonb,p_provider_key text,p_dataset_name text default 'Collected data') returns jsonb language plpgsql security invoker set search_path = '' as $$
declare new_job_id uuid; new_run_id uuid; new_dataset_id uuid; safe_actor_key text; safe_provider_key text; safe_dataset_name text; selected_provider_id uuid; selected_capabilities jsonb;
begin
if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
safe_actor_key:=lower(btrim(coalesce(p_actor_key,''))); safe_provider_key:=lower(btrim(coalesce(p_provider_key,''))); safe_dataset_name:=btrim(coalesce(p_dataset_name,'Collected data'));
if safe_actor_key<>'public_page_metadata' or p_actor_version is distinct from 1 or safe_provider_key not in ('crawlee','playwright','gigo_safe_http_batch','decodo') or jsonb_typeof(coalesce(p_input,'{}'::jsonb))<>'object' or octet_length(coalesce(p_input,'{}'::jsonb)::text)>32768 or char_length(safe_dataset_name) not between 1 and 180 then raise exception 'invalid collection run request' using errcode='22023'; end if;
select p.id,p.capabilities into selected_provider_id,selected_capabilities from public.collection_providers p where p.user_id=auth.uid() and p.provider_key=safe_provider_key and p.status='healthy' for share;
if selected_provider_id is null or (coalesce(selected_capabilities,'[]'::jsonb) @> jsonb_build_array('web_fetch')) is not true then raise exception 'provider is not healthy or lacks required actor capability' using errcode='22023'; end if;
insert into public.jobs(user_id,job_type,status,input,progress,run_after,idempotency_key) values(auth.uid(),'collection_run','pending',jsonb_build_object('actor_key',safe_actor_key,'actor_version',p_actor_version,'actor_input',coalesce(p_input,'{}'::jsonb),'provider_key',safe_provider_key),jsonb_build_object('stage','queued'),now(),'collection:'||gen_random_uuid()::text) returning id into new_job_id;
insert into public.collection_runs(user_id,job_id,provider_id,actor_key,actor_version,provider_key,status,input) values(auth.uid(),new_job_id,selected_provider_id,safe_actor_key,p_actor_version,safe_provider_key,'queued',coalesce(p_input,'{}'::jsonb)) returning id into new_run_id;
insert into public.collection_datasets(user_id,run_id,name,metadata) values(auth.uid(),new_run_id,safe_dataset_name,jsonb_build_object('actor_key',safe_actor_key,'actor_version',p_actor_version,'provider_key',safe_provider_key)) returning id into new_dataset_id;
update public.jobs set input=input||jsonb_build_object('collection_run_id',new_run_id,'dataset_id',new_dataset_id,'provider_key',safe_provider_key) where id=new_job_id and user_id=auth.uid();
return jsonb_build_object('job_id',new_job_id,'run_id',new_run_id,'dataset_id',new_dataset_id,'provider_key',safe_provider_key,'status','queued','execution_enabled',false);
end; $$;
revoke all on function public.gigo_create_collection_run(text,integer,jsonb,text,text) from public,anon;
grant execute on function public.gigo_create_collection_run(text,integer,jsonb,text,text) to authenticated;
comment on function public.gigo_create_collection_run(text,integer,jsonb,text,text) is 'Creates a queued public-page metadata run bound to an owner-configured healthy provider. Decodo credentials remain in worker secrets.';
-- END CANONICAL MIGRATION 0046_decodo_web_data_api.sql