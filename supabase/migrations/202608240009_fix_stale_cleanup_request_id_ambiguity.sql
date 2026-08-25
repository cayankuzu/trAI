-- 008 was already deployed before the live acceptance check exposed that the
-- RETURNS TABLE output name `request_id` shadows an unqualified ledger column.
-- Recreate only the cleanup RPC with the ledger alias made explicit.

create or replace function public.claim_stale_try_on_cleanup(
  p_user_id uuid,
  p_limit smallint default 10
)
returns table (request_id uuid, cleanup_paths text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  stale_row record;
  selected_paths text[];
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'service_role required' using errcode = '42501'; end if;
  if p_user_id is null then raise exception 'invalid user id'; end if;
  if p_limit is null or p_limit not between 1 and 25 then raise exception 'invalid cleanup limit'; end if;

  for stale_row in
    select request.*
    from public.try_ons request
    left join public.try_on_usage usage on usage.request_id = request.id and usage.user_id = request.user_id
    where request.user_id = p_user_id
      and (request.source_path is null or request.source_path = any(array[
        p_user_id::text || '/' || request.id::text || '/person.jpg',
        p_user_id::text || '/' || request.id::text || '/person.png',
        p_user_id::text || '/' || request.id::text || '/person.webp'
      ]::text[]))
      and (request.garment_path is null or request.garment_path = any(array[
        p_user_id::text || '/' || request.id::text || '/garment-upload.jpg',
        p_user_id::text || '/' || request.id::text || '/garment-upload.png',
        p_user_id::text || '/' || request.id::text || '/garment-upload.webp',
        p_user_id::text || '/' || request.id::text || '/garment-og.jpg',
        p_user_id::text || '/' || request.id::text || '/garment-og.png',
        p_user_id::text || '/' || request.id::text || '/garment-og.webp'
      ]::text[]))
      and (request.result_path is null or request.result_path = any(array[
        p_user_id::text || '/' || request.id::text || '/result.jpg',
        p_user_id::text || '/' || request.id::text || '/result.png',
        p_user_id::text || '/' || request.id::text || '/result.webp'
      ]::text[]))
      and (
        (
          request.status = 'processing'
          and request.created_at < pg_catalog.now() - interval '30 minutes'
          and request.provider_request_id is null
          and usage.provider_started_at is null
          and (usage.processing_started_at is null or usage.processing_started_at < pg_catalog.now() - interval '5 minutes')
        )
        or (
          request.status = 'failed'
          and request.updated_at < pg_catalog.now() - interval '5 minutes'
          and (request.source_path is not null or request.garment_path is not null or request.result_path is not null)
        )
        or (
          request.status = 'completed'
          and request.updated_at < pg_catalog.now() - interval '5 minutes'
          and (request.source_path is not null or request.garment_path is not null)
        )
      )
    order by request.updated_at asc
    limit p_limit
    for update of request skip locked
  loop
    if stale_row.status = 'processing' then
      update public.try_ons
      set status = 'failed', error_code = 'upload_expired'
      where id = stale_row.id and user_id = p_user_id and status = 'processing';

      delete from public.try_on_usage as stale_usage
      where stale_usage.request_id = stale_row.id
        and stale_usage.user_id = p_user_id
        and stale_usage.provider_started_at is null;
    end if;

    selected_paths := pg_catalog.array_remove(array[
      stale_row.source_path,
      stale_row.garment_path,
      case when stale_row.status = 'completed' then null::text else stale_row.result_path end
    ]::text[], null::text);
    if pg_catalog.cardinality(selected_paths) > 0 then
      request_id := stale_row.id;
      cleanup_paths := selected_paths;
      return next;
    end if;
  end loop;
end;
$$;

revoke all on function public.claim_stale_try_on_cleanup(uuid, smallint) from public, anon, authenticated;
grant execute on function public.claim_stale_try_on_cleanup(uuid, smallint) to service_role;
