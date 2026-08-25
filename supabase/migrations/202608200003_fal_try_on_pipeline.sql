alter table public.try_ons
  add column if not exists garment_path text,
  add column if not exists provider text,
  add column if not exists provider_request_id text;

create unique index if not exists try_ons_provider_request_idx
  on public.try_ons (provider, provider_request_id)
  where provider_request_id is not null;

comment on column public.try_ons.garment_path is 'Private user-photos path for the garment input.';
comment on column public.try_ons.provider_request_id is 'Server-only provider queue request identifier used for idempotent resume.';

-- Kota kullanıcı tarafından değiştirilemeyen ayrı ledger'da tutulur. try_ons satırının
-- silinmesi veya durumunun değiştirilmesi yeni AI kredisi açmaz.
create table if not exists public.try_on_usage (
  request_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  claimed_at timestamptz not null default pg_catalog.now(),
  processing_started_at timestamptz,
  provider_started_at timestamptz,
  provider_request_id text unique
);

create index if not exists try_on_usage_user_period_idx
  on public.try_on_usage (user_id, period_start);

alter table public.try_on_usage enable row level security;

-- Uygulama yeni satırı yalnız atomic kota RPC'siyle açar.
drop policy if exists "try_ons_insert_own" on public.try_ons;
drop policy if exists "try_ons_update_own" on public.try_ons;
drop policy if exists "try_ons_delete_own" on public.try_ons;

-- Browser sessions cannot write server-owned try-on fields directly. Inserts and
-- state transitions are restricted to the SECURITY DEFINER functions below.
revoke insert, update, delete on table public.try_ons from public;
revoke insert, update, delete on table public.try_ons from anon, authenticated;

-- 003 geliştirme sırasında kullanılan authenticated imzaları varsa kaldır. Bu akışın
-- hiçbir durum/kota RPC'si tarayıcı JWT'siyle çağrılamaz.
drop function if exists public.claim_try_on_upload(uuid, text, text, text);
drop function if exists public.begin_try_on_generation(uuid);
drop function if exists public.record_try_on_provider_request(uuid, text);
drop function if exists public.prepare_try_on_garment(uuid, text);
drop function if exists public.prepare_try_on_result(uuid, text);
drop function if exists public.complete_try_on_generation(uuid, text, text);
drop function if exists public.fail_try_on_generation(uuid, text);
drop function if exists public.record_try_on_retryable_error(uuid, text, boolean);

create or replace function public.claim_try_on_upload(
  p_user_id uuid,
  p_request_id uuid,
  p_product_url text,
  p_person_extension text,
  p_garment_extension text default null
)
returns table (
  outcome text,
  used_count bigint,
  limit_count integer,
  person_path text,
  garment_path text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_month date := pg_catalog.date_trunc('month', pg_catalog.now())::date;
  current_count bigint;
  fixed_monthly_limit constant integer := 5;
  next_person_path text;
  next_garment_path text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'invalid user id';
  end if;
  if p_product_url is null or pg_catalog.char_length(p_product_url) > 2048 then
    raise exception 'invalid product url';
  end if;
  if p_person_extension not in ('jpg', 'png', 'webp') then
    raise exception 'invalid person extension';
  end if;
  if p_garment_extension is not null and p_garment_extension not in ('jpg', 'png', 'webp') then
    raise exception 'invalid garment extension';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':' || current_month::text, 0)
  );

  select count(*) into current_count
  from public.try_on_usage
  where user_id = p_user_id
    and period_start = current_month
    and (
      provider_started_at is not null
      or claimed_at >= pg_catalog.now() - interval '15 minutes'
    );

  if exists (
    select 1 from public.try_on_usage
    where request_id = p_request_id and user_id = p_user_id
  ) then
    select source_path, public.try_ons.garment_path
      into next_person_path, next_garment_path
    from public.try_ons
    where id = p_request_id and user_id = p_user_id and product_url = p_product_url;
    if not found then
      return query select 'request_conflict'::text, current_count, fixed_monthly_limit, null::text, null::text;
      return;
    end if;
    if next_person_path <> (p_user_id::text || '/' || p_request_id::text || '/person.' || p_person_extension)
       or next_garment_path is distinct from (
         case when p_garment_extension is null then null
           else p_user_id::text || '/' || p_request_id::text || '/garment-upload.' || p_garment_extension
         end
       ) then
      return query select 'request_conflict'::text, current_count, fixed_monthly_limit, null::text, null::text;
      return;
    end if;
    return query select 'existing'::text, current_count, fixed_monthly_limit, next_person_path, next_garment_path;
    return;
  end if;

  if exists (select 1 from public.try_ons where id = p_request_id) then
    return query select 'request_conflict'::text, current_count, fixed_monthly_limit, null::text, null::text;
    return;
  end if;
  if current_count >= fixed_monthly_limit then
    return query select 'quota_exceeded'::text, current_count, fixed_monthly_limit, null::text, null::text;
    return;
  end if;

  next_person_path := p_user_id::text || '/' || p_request_id::text || '/person.' || p_person_extension;
  next_garment_path := case when p_garment_extension is null then null
    else p_user_id::text || '/' || p_request_id::text || '/garment-upload.' || p_garment_extension end;

  insert into public.try_ons (id, user_id, product_url, source_path, garment_path, provider, status)
  values (p_request_id, p_user_id, p_product_url, next_person_path, next_garment_path, 'fal', 'processing');
  insert into public.try_on_usage (request_id, user_id, period_start)
  values (p_request_id, p_user_id, current_month);

  return query select 'claimed'::text, current_count + 1, fixed_monthly_limit, next_person_path, next_garment_path;
end;
$$;

create or replace function public.begin_try_on_generation(
  p_user_id uuid,
  p_request_id uuid
)
returns table (outcome text, provider_request_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  usage_row public.try_on_usage%rowtype;
  current_month date := pg_catalog.date_trunc('month', pg_catalog.now())::date;
  current_count bigint;
  fixed_monthly_limit constant integer := 5;
  reservation_is_active boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'invalid user id';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':' || current_month::text, 0)
  );

  select * into usage_row from public.try_on_usage
  where request_id = p_request_id and user_id = p_user_id
  for update;
  if not found then
    raise exception 'usage reservation not found';
  end if;

  perform 1 from public.try_ons
  where id = p_request_id
    and user_id = p_user_id
    and status = 'processing'
    and provider = 'fal'
  for update;
  if not found then
    raise exception 'try-on request not ready';
  end if;

  if usage_row.provider_request_id is not null then
    if usage_row.processing_started_at is not null
       and usage_row.processing_started_at >= pg_catalog.now() - interval '3 minutes' then
      return query select 'busy'::text, null::text;
      return;
    end if;
    update public.try_on_usage set processing_started_at = pg_catalog.now()
    where request_id = p_request_id and user_id = p_user_id;
    return query select 'existing'::text, usage_row.provider_request_id;
    return;
  end if;

  reservation_is_active := usage_row.period_start = current_month
    and usage_row.claimed_at >= pg_catalog.now() - interval '15 minutes';
  if not reservation_is_active then
    select count(*) into current_count
    from public.try_on_usage
    where user_id = p_user_id
      and period_start = current_month
      and (
        provider_started_at is not null
        or claimed_at >= pg_catalog.now() - interval '15 minutes'
      );
    if current_count >= fixed_monthly_limit then
      return query select 'quota_exceeded'::text, null::text;
      return;
    end if;
  end if;
  if usage_row.processing_started_at is not null
     and usage_row.processing_started_at >= pg_catalog.now() - interval '3 minutes' then
    return query select 'busy'::text, null::text;
    return;
  end if;

  update public.try_on_usage
  set processing_started_at = pg_catalog.now(),
      claimed_at = case when reservation_is_active then claimed_at else pg_catalog.now() end,
      period_start = case when reservation_is_active then period_start else current_month end
  where request_id = p_request_id and user_id = p_user_id;
  return query select 'acquired'::text, null::text;
end;
$$;

create or replace function public.record_try_on_provider_request(
  p_user_id uuid,
  p_request_id uuid,
  p_provider_request_id text
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
  if p_user_id is null then
    raise exception 'invalid user id';
  end if;
  if p_provider_request_id is null
     or pg_catalog.char_length(p_provider_request_id) < 1
     or pg_catalog.char_length(p_provider_request_id) > 200 then
    raise exception 'invalid provider request id';
  end if;

  update public.try_on_usage
  set provider_request_id = p_provider_request_id,
      provider_started_at = coalesce(provider_started_at, pg_catalog.now())
  where request_id = p_request_id and user_id = p_user_id
    and processing_started_at is not null
    and (provider_request_id is null or provider_request_id = p_provider_request_id);
  if not found then raise exception 'usage reservation not found'; end if;

  update public.try_ons set provider_request_id = p_provider_request_id
  where id = p_request_id and user_id = p_user_id and status = 'processing'
    and provider = 'fal'
    and (provider_request_id is null or provider_request_id = p_provider_request_id);
  if not found then raise exception 'try-on request not found'; end if;
  return true;
end;
$$;

create or replace function public.prepare_try_on_garment(
  p_user_id uuid,
  p_request_id uuid,
  p_garment_path text
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
  if p_user_id is null then
    raise exception 'invalid user id';
  end if;
  if p_garment_path is null or not (
    p_garment_path = any(array[
      p_user_id::text || '/' || p_request_id::text || '/garment-upload.jpg',
      p_user_id::text || '/' || p_request_id::text || '/garment-upload.png',
      p_user_id::text || '/' || p_request_id::text || '/garment-upload.webp',
      p_user_id::text || '/' || p_request_id::text || '/garment-og.jpg',
      p_user_id::text || '/' || p_request_id::text || '/garment-og.png',
      p_user_id::text || '/' || p_request_id::text || '/garment-og.webp'
    ]::text[])
  ) then
    raise exception 'invalid garment path';
  end if;

  update public.try_ons
  set garment_path = p_garment_path
  where id = p_request_id
    and user_id = p_user_id
    and status = 'processing'
    and provider = 'fal'
    and provider_request_id is null
    and result_path is null
    and source_path = any(array[
      p_user_id::text || '/' || p_request_id::text || '/person.jpg',
      p_user_id::text || '/' || p_request_id::text || '/person.png',
      p_user_id::text || '/' || p_request_id::text || '/person.webp'
    ]::text[])
    and exists (
      select 1 from public.try_on_usage
      where request_id = p_request_id
        and user_id = p_user_id
        and processing_started_at is not null
    );
  if not found then raise exception 'invalid garment transition'; end if;
  return true;
end;
$$;

create or replace function public.prepare_try_on_result(
  p_user_id uuid,
  p_request_id uuid,
  p_result_path text
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
  if p_user_id is null then
    raise exception 'invalid user id';
  end if;
  if p_result_path is null or not (
    p_result_path = any(array[
      p_user_id::text || '/' || p_request_id::text || '/result.jpg',
      p_user_id::text || '/' || p_request_id::text || '/result.png',
      p_user_id::text || '/' || p_request_id::text || '/result.webp'
    ]::text[])
  ) then
    raise exception 'invalid result path';
  end if;

  update public.try_ons
  set result_path = p_result_path
  where id = p_request_id
    and user_id = p_user_id
    and status = 'processing'
    and provider = 'fal'
    and provider_request_id is not null
    and (result_path is null or result_path = p_result_path)
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
      select 1 from public.try_on_usage
      where request_id = p_request_id
        and user_id = p_user_id
        and provider_request_id = public.try_ons.provider_request_id
        and provider_started_at is not null
    );
  if not found then raise exception 'invalid result transition'; end if;
  return true;
end;
$$;

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
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'invalid user id';
  end if;
  if p_provider_request_id is null
     or pg_catalog.char_length(p_provider_request_id) < 1
     or pg_catalog.char_length(p_provider_request_id) > 200 then
    raise exception 'invalid provider request id';
  end if;
  if p_result_path is null or not (
    p_result_path = any(array[
      p_user_id::text || '/' || p_request_id::text || '/result.jpg',
      p_user_id::text || '/' || p_request_id::text || '/result.png',
      p_user_id::text || '/' || p_request_id::text || '/result.webp'
    ]::text[])
  ) then
    raise exception 'invalid result path';
  end if;

  update public.try_ons
  set source_path = null,
      garment_path = null,
      result_path = p_result_path,
      fit_score = null,
      size_recommendation = null,
      status = 'completed',
      error_code = null
  where id = p_request_id
    and user_id = p_user_id
    and status = 'processing'
    and provider = 'fal'
    and provider_request_id = p_provider_request_id
    and result_path = p_result_path
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
      select 1 from public.try_on_usage
      where request_id = p_request_id
        and user_id = p_user_id
        and provider_request_id = p_provider_request_id
        and provider_started_at is not null
    );
  if not found then raise exception 'invalid completion transition'; end if;

  update public.try_on_usage
  set processing_started_at = null
  where request_id = p_request_id
    and user_id = p_user_id
    and provider_request_id = p_provider_request_id;
  if not found then raise exception 'usage reservation not found'; end if;
  return true;
end;
$$;

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
  if p_user_id is null then
    raise exception 'invalid user id';
  end if;
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

  -- Sağlayıcı hiç başlamadıysa rezervasyonu hemen serbest bırak. Belirsiz submit
  -- durumunda olası maliyeti muhafazakâr biçimde ledger'da tut. Fal tarafından işlenmeyen
  -- user start-timeout 504 yanıtında ise provider id yazılmış olsa da hakkı iade et.
  delete from public.try_on_usage
  where request_id = p_request_id
    and user_id = p_user_id
    and (
      (provider_started_at is null and p_error_code <> 'provider_submit_uncertain')
      or p_error_code = 'provider_start_timeout'
    );
  if not found then
    update public.try_on_usage
    set processing_started_at = null
    where request_id = p_request_id and user_id = p_user_id;
    if not found then raise exception 'usage reservation not found'; end if;
  end if;
  return true;
end;
$$;

create or replace function public.record_try_on_retryable_error(
  p_user_id uuid,
  p_request_id uuid,
  p_error_code text,
  p_clear_result boolean default false
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
  if p_user_id is null then
    raise exception 'invalid user id';
  end if;
  if p_error_code is null
     or pg_catalog.char_length(p_error_code) > 100
     or p_error_code !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'invalid error code';
  end if;

  update public.try_ons
  set result_path = case when p_clear_result then null else result_path end,
      error_code = p_error_code
  where id = p_request_id
    and user_id = p_user_id
    and status = 'processing'
    and provider = 'fal'
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
    and (
      result_path is null
      or result_path = any(array[
        p_user_id::text || '/' || p_request_id::text || '/result.jpg',
        p_user_id::text || '/' || p_request_id::text || '/result.png',
        p_user_id::text || '/' || p_request_id::text || '/result.webp'
      ]::text[])
    )
    and exists (
      select 1 from public.try_on_usage
      where request_id = p_request_id and user_id = p_user_id
    );
  if not found then raise exception 'invalid retry transition'; end if;

  update public.try_on_usage
  set processing_started_at = null
  where request_id = p_request_id and user_id = p_user_id;
  if not found then raise exception 'usage reservation not found'; end if;
  return true;
end;
$$;

-- Tarayıcı JWT'sine Storage insert/update yetkisi verilmez. Sunucu secret client tam
-- path için signed upload token üretir; browser yalnız bu tek-kullanımlık tokenı kullanır.
-- Kullanıcının initial migration'daki own select/delete politikaları korunur.
drop policy if exists "user_photos_insert_own" on storage.objects;
drop policy if exists "user_photos_update_own" on storage.objects;
drop policy if exists "user_photos_insert_claimed" on storage.objects;

revoke all on function public.claim_try_on_upload(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.begin_try_on_generation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_try_on_provider_request(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.prepare_try_on_garment(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.prepare_try_on_result(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.complete_try_on_generation(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.fail_try_on_generation(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.record_try_on_retryable_error(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.claim_try_on_upload(uuid, uuid, text, text, text) to service_role;
grant execute on function public.begin_try_on_generation(uuid, uuid) to service_role;
grant execute on function public.record_try_on_provider_request(uuid, uuid, text) to service_role;
grant execute on function public.prepare_try_on_garment(uuid, uuid, text) to service_role;
grant execute on function public.prepare_try_on_result(uuid, uuid, text) to service_role;
grant execute on function public.complete_try_on_generation(uuid, uuid, text, text) to service_role;
grant execute on function public.fail_try_on_generation(uuid, uuid, text) to service_role;
grant execute on function public.record_try_on_retryable_error(uuid, uuid, text, boolean) to service_role;
