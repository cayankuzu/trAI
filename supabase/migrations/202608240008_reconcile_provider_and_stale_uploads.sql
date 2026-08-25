-- Preserve cleanup metadata until private Storage deletion succeeds, and expose
-- a service-only lazy cleanup batch for abandoned uploads.

create or replace function public.complete_try_on_generation(
  p_user_id uuid,
  p_request_id uuid,
  p_provider_request_id text,
  p_result_path text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'service_role required' using errcode = '42501'; end if;
  if p_user_id is null or p_request_id is null then raise exception 'invalid identity'; end if;
  if p_provider_request_id is null or pg_catalog.char_length(p_provider_request_id) not between 1 and 200 then raise exception 'invalid provider request id'; end if;
  if p_result_path is null or not (p_result_path = any(array[
    p_user_id::text || '/' || p_request_id::text || '/result.jpg',
    p_user_id::text || '/' || p_request_id::text || '/result.png',
    p_user_id::text || '/' || p_request_id::text || '/result.webp'
  ]::text[])) then raise exception 'invalid result path'; end if;

  update public.try_ons
  set result_path = p_result_path,
      status = 'completed',
      error_code = null
  where id = p_request_id and user_id = p_user_id and status = 'processing' and provider = 'fal'
    and provider_request_id = p_provider_request_id and result_path = p_result_path
    and source_path = any(array[
      p_user_id::text || '/' || p_request_id::text || '/person.jpg',
      p_user_id::text || '/' || p_request_id::text || '/person.png',
      p_user_id::text || '/' || p_request_id::text || '/person.webp'
    ]::text[])
    and garment_path = any(array[
      p_user_id::text || '/' || p_request_id::text || '/garment-upload.jpg',
      p_user_id::text || '/' || p_request_id::text || '/garment-upload.png',
      p_user_id::text || '/' || p_request_id::text || '/garment-upload.webp',
      p_user_id::text || '/' || p_request_id::text || '/garment-og.jpg',
      p_user_id::text || '/' || p_request_id::text || '/garment-og.png',
      p_user_id::text || '/' || p_request_id::text || '/garment-og.webp'
    ]::text[])
    and exists (
      select 1 from public.try_on_usage where request_id = p_request_id and user_id = p_user_id
        and provider_request_id = p_provider_request_id and provider_started_at is not null
    );
  if not found then raise exception 'invalid completion transition'; end if;

  update public.try_on_usage set processing_started_at = null
  where request_id = p_request_id and user_id = p_user_id and provider_request_id = p_provider_request_id;
  if not found then raise exception 'usage reservation not found'; end if;
  return true;
end;
$$;

revoke all on function public.complete_try_on_generation(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.complete_try_on_generation(uuid, uuid, text, text) to service_role;

create or replace function public.fail_try_on_generation(
  p_user_id uuid,
  p_request_id uuid,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'service_role required' using errcode = '42501'; end if;
  if p_user_id is null or p_request_id is null then raise exception 'invalid identity'; end if;
  if p_error_code is null
     or pg_catalog.char_length(p_error_code) > 100
     or p_error_code !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'invalid error code';
  end if;

  update public.try_ons
  set status = 'failed',
      error_code = p_error_code
  where id = p_request_id
    and user_id = p_user_id
    and status = 'processing'
    and provider = 'fal'
    -- Retained paths are later handed to a Storage delete call. Keep that
    -- cleanup manifest restricted to the deterministic paths owned by this row.
    and (source_path is null or source_path = any(array[
      p_user_id::text || '/' || p_request_id::text || '/person.jpg',
      p_user_id::text || '/' || p_request_id::text || '/person.png',
      p_user_id::text || '/' || p_request_id::text || '/person.webp'
    ]::text[]))
    and (garment_path is null or garment_path = any(array[
      p_user_id::text || '/' || p_request_id::text || '/garment-upload.jpg',
      p_user_id::text || '/' || p_request_id::text || '/garment-upload.png',
      p_user_id::text || '/' || p_request_id::text || '/garment-upload.webp',
      p_user_id::text || '/' || p_request_id::text || '/garment-og.jpg',
      p_user_id::text || '/' || p_request_id::text || '/garment-og.png',
      p_user_id::text || '/' || p_request_id::text || '/garment-og.webp'
    ]::text[]))
    and (result_path is null or result_path = any(array[
      p_user_id::text || '/' || p_request_id::text || '/result.jpg',
      p_user_id::text || '/' || p_request_id::text || '/result.png',
      p_user_id::text || '/' || p_request_id::text || '/result.webp'
    ]::text[]));
  if not found then raise exception 'invalid failure transition'; end if;

  delete from public.try_on_usage
  where request_id = p_request_id
    and user_id = p_user_id
    and (
      (provider_started_at is null and p_error_code <> 'provider_submit_uncertain')
      or p_error_code = any(array['provider_start_timeout','provider_cancelled']::text[])
    );
  if not found then
    update public.try_on_usage
    set processing_started_at = null,
        provider_started_at = case
          when p_error_code = 'provider_submit_uncertain'
            then coalesce(provider_started_at, pg_catalog.now())
          else provider_started_at
        end
    where request_id = p_request_id and user_id = p_user_id;
    if not found then raise exception 'usage reservation not found'; end if;
  end if;
  return true;
end;
$$;

revoke all on function public.fail_try_on_generation(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fail_try_on_generation(uuid, uuid, text) to service_role;

create or replace function public.finalize_try_on_input_cleanup(
  p_user_id uuid,
  p_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'service_role required' using errcode = '42501'; end if;
  if p_user_id is null or p_request_id is null then raise exception 'invalid identity'; end if;

  update public.try_ons
  set source_path = null,
      garment_path = null,
      result_path = case when status = 'completed' then result_path else null end
  where id = p_request_id
    and user_id = p_user_id
    and status = any(array['completed','failed']::public.try_on_status[])
    and (source_path is null or source_path = any(array[
      p_user_id::text || '/' || p_request_id::text || '/person.jpg',
      p_user_id::text || '/' || p_request_id::text || '/person.png',
      p_user_id::text || '/' || p_request_id::text || '/person.webp'
    ]::text[]))
    and (garment_path is null or garment_path = any(array[
      p_user_id::text || '/' || p_request_id::text || '/garment-upload.jpg',
      p_user_id::text || '/' || p_request_id::text || '/garment-upload.png',
      p_user_id::text || '/' || p_request_id::text || '/garment-upload.webp',
      p_user_id::text || '/' || p_request_id::text || '/garment-og.jpg',
      p_user_id::text || '/' || p_request_id::text || '/garment-og.png',
      p_user_id::text || '/' || p_request_id::text || '/garment-og.webp'
    ]::text[]))
    and (result_path is null or result_path = any(array[
      p_user_id::text || '/' || p_request_id::text || '/result.jpg',
      p_user_id::text || '/' || p_request_id::text || '/result.png',
      p_user_id::text || '/' || p_request_id::text || '/result.webp'
    ]::text[]));
  if not found then raise exception 'cleanup transition not found'; end if;
  return true;
end;
$$;

revoke all on function public.finalize_try_on_input_cleanup(uuid, uuid) from public, anon, authenticated;
grant execute on function public.finalize_try_on_input_cleanup(uuid, uuid) to service_role;

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
      -- Never return a caller-controlled or corrupted path to the privileged
      -- Storage cleanup code, even if a historical row escaped an invariant.
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
