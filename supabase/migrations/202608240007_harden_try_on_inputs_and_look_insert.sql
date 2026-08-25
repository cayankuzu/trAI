-- Harden direct authenticated look writes and keep try-on inputs append-only.

update storage.buckets
set file_size_limit = 6291456,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'user-photos';

-- Signed upload tokens are the only browser write path. Direct authenticated
-- delete would let a client remove an input while a provider lease is active.
drop policy if exists "user_photos_delete_own" on storage.objects;

drop policy if exists "looks_insert_own" on public.looks;
drop policy if exists "looks_update_own" on public.looks;

create policy "looks_insert_own" on public.looks for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and (group_id is null or exists (
    select 1 from public.look_groups
    where id = group_id and user_id = (select auth.uid())
  ))
  and (
    (try_on_id is not null and try_on_session_id is null and exists (
      select 1 from public.try_ons source_try_on
      where source_try_on.id = try_on_id
        and source_try_on.user_id = (select auth.uid())
        and source_try_on.status = 'completed'
    ))
    or
    (try_on_id is null and try_on_session_id is not null and exists (
      select 1 from public.try_on_sessions source_session
      where source_session.id = try_on_session_id
        and source_session.user_id = (select auth.uid())
        and exists (
          select 1 from public.try_ons completed_variant
          where completed_variant.session_id = source_session.id
            and completed_variant.user_id = (select auth.uid())
            and completed_variant.status = 'completed'
        )
    ))
  )
  and (cover_try_on_id is null or exists (
    select 1 from public.try_ons cover_try_on
    where cover_try_on.id = cover_try_on_id
      and cover_try_on.user_id = (select auth.uid())
      and cover_try_on.status = 'completed'
      and (
        (try_on_id is not null and cover_try_on.id = try_on_id)
        or (try_on_session_id is not null and cover_try_on.session_id = try_on_session_id)
      )
  ))
);

create policy "looks_update_own" on public.looks for update to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (group_id is null or exists (
    select 1 from public.look_groups
    where id = group_id and user_id = (select auth.uid())
  ))
  and (
    (try_on_id is not null and try_on_session_id is null and exists (
      select 1 from public.try_ons source_try_on
      where source_try_on.id = try_on_id
        and source_try_on.user_id = (select auth.uid())
        and source_try_on.status = 'completed'
    ))
    or
    (try_on_id is null and try_on_session_id is not null and exists (
      select 1 from public.try_on_sessions source_session
      where source_session.id = try_on_session_id
        and source_session.user_id = (select auth.uid())
        and exists (
          select 1 from public.try_ons completed_variant
          where completed_variant.session_id = source_session.id
            and completed_variant.user_id = (select auth.uid())
            and completed_variant.status = 'completed'
        )
    ))
  )
  and (cover_try_on_id is null or exists (
    select 1 from public.try_ons cover_try_on
    where cover_try_on.id = cover_try_on_id
      and cover_try_on.user_id = (select auth.uid())
      and cover_try_on.status = 'completed'
      and (
        (try_on_id is not null and cover_try_on.id = try_on_id)
        or (try_on_session_id is not null and cover_try_on.session_id = try_on_session_id)
      )
  ))
);

-- A possible paid provider submit must continue counting after the short claim
-- lease expires, even when the provider request id could not be persisted.
update public.try_on_usage usage
set provider_started_at = coalesce(usage.provider_started_at, usage.claimed_at)
from public.try_ons request
where request.id = usage.request_id
  and request.user_id = usage.user_id
  and request.error_code = 'provider_submit_uncertain';

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
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;
  if p_user_id is null then raise exception 'invalid user id'; end if;
  if p_error_code is null
     or pg_catalog.char_length(p_error_code) > 100
     or p_error_code !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'invalid error code';
  end if;

  update public.try_ons
  set source_path = null,
      garment_path = null,
      result_path = null,
      status = 'failed',
      error_code = p_error_code
  where id = p_request_id
    and user_id = p_user_id
    and status = 'processing'
    and provider = 'fal';
  if not found then raise exception 'invalid failure transition'; end if;

  delete from public.try_on_usage
  where request_id = p_request_id
    and user_id = p_user_id
    and (
      (provider_started_at is null and p_error_code <> 'provider_submit_uncertain')
      or p_error_code = 'provider_start_timeout'
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

-- Bound abandoned upload reservations even before a scheduled object cleanup is
-- configured. Monthly provider quota remains five; this cap only limits stale claims.
create or replace function public.enforce_try_on_daily_reservation_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  daily_count integer;
  fixed_daily_reservation_limit constant integer := 20;
  current_day timestamptz := pg_catalog.date_trunc('day', pg_catalog.now());
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('try-on-daily:' || new.user_id::text || ':' || current_day::text, 0)
  );
  select count(*) into daily_count
  from public.try_ons
  where user_id = new.user_id and created_at >= current_day;
  if daily_count >= fixed_daily_reservation_limit then
    raise exception 'daily reservation limit reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_try_on_daily_reservation_cap() from public, anon, authenticated;
grant execute on function public.enforce_try_on_daily_reservation_cap() to service_role;

drop trigger if exists try_ons_daily_reservation_cap on public.try_ons;
create trigger try_ons_daily_reservation_cap
before insert on public.try_ons
for each row execute function public.enforce_try_on_daily_reservation_cap();
