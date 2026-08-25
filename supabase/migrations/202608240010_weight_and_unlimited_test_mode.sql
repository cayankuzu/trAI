-- Add an optional whole-kilogram profile measurement and a server-controlled
-- quota exemption for local/MVP try-on testing. Browser roles never receive
-- permission to set quota_exempt directly.

alter table public.measurements
  add column if not exists weight_kg smallint;

alter table public.measurements
  drop constraint if exists measurements_weight_kg_check;

alter table public.measurements
  add constraint measurements_weight_kg_check
    check (weight_kg is null or weight_kg between 20 and 350);

alter table public.try_ons
  add column if not exists quota_exempt boolean not null default false;

comment on column public.try_ons.quota_exempt is
  'Server-owned test-mode marker. Exempt rows do not consume application quota.';

-- The catalog size vocabulary has nine top sizes and two possible photo views.
-- This is a structural manifest bound, not a usage quota.
alter table public.try_on_sessions
  drop constraint if exists try_on_sessions_selected_sizes_check;

alter table public.try_on_sessions
  add constraint try_on_sessions_selected_sizes_check
    check (pg_catalog.cardinality(selected_sizes) between 1 and 9);

create function public.update_own_profile(
  p_full_name text,
  p_gender public.gender_option,
  p_height_cm smallint,
  p_weight_kg smallint,
  p_chest_cm smallint,
  p_waist_cm smallint,
  p_hip_cm smallint,
  p_usual_top_size text,
  p_usual_bottom_size text,
  p_bottom_size_system text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null or coalesce(auth.role(), '') <> 'authenticated' then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_full_name is null
     or pg_catalog.char_length(pg_catalog.btrim(p_full_name)) < 2
     or pg_catalog.char_length(pg_catalog.btrim(p_full_name)) > 80 then
    raise exception 'invalid full name';
  end if;
  if p_height_cm is not null and p_height_cm not between 80 and 250 then raise exception 'invalid height'; end if;
  if p_weight_kg is not null and p_weight_kg not between 20 and 350 then raise exception 'invalid weight'; end if;
  if p_chest_cm is not null and p_chest_cm not between 40 and 200 then raise exception 'invalid chest'; end if;
  if p_waist_cm is not null and p_waist_cm not between 40 and 200 then raise exception 'invalid waist'; end if;
  if p_hip_cm is not null and p_hip_cm not between 40 and 200 then raise exception 'invalid hip'; end if;
  if p_usual_top_size is not null and p_usual_top_size <> all(array['XXS','XS','S','M','L','XL','XXL','3XL','4XL']::text[]) then
    raise exception 'invalid top size';
  end if;
  if p_bottom_size_system is null or p_bottom_size_system <> all(array['EU','W']::text[]) then
    raise exception 'invalid bottom size system';
  end if;
  if p_usual_bottom_size is not null and not (
    case when p_usual_bottom_size ~ '^[0-9]{2}$' then
      (p_bottom_size_system = 'EU' and p_usual_bottom_size::integer between 32 and 60)
      or (p_bottom_size_system = 'W' and p_usual_bottom_size::integer between 24 and 44)
    else false end
  ) then
    raise exception 'invalid bottom size';
  end if;

  update public.profiles
  set full_name = pg_catalog.btrim(p_full_name), gender = p_gender
  where user_id = current_user_id;
  if not found then raise exception 'profile not found'; end if;

  update public.measurements
  set height_cm = p_height_cm,
      weight_kg = p_weight_kg,
      chest_cm = p_chest_cm,
      waist_cm = p_waist_cm,
      hip_cm = p_hip_cm,
      usual_top_size = p_usual_top_size,
      usual_bottom_size = p_usual_bottom_size,
      bottom_size_system = p_bottom_size_system
  where user_id = current_user_id;
  if not found then raise exception 'measurements not found'; end if;
  return true;
end;
$$;

revoke all on function public.update_own_profile(text, public.gender_option, smallint, smallint, smallint, smallint, smallint, text, text, text) from public, anon;
grant execute on function public.update_own_profile(text, public.gender_option, smallint, smallint, smallint, smallint, smallint, text, text, text) to authenticated;

create function public.claim_try_on_batch(
  p_user_id uuid,
  p_session_id uuid,
  p_product_id text,
  p_product_url text,
  p_request_ids uuid[],
  p_selected_sizes text[],
  p_photo_views text[],
  p_person_extensions text[],
  p_fit_intents text[],
  p_fit_scores smallint[],
  p_size_recommendations text[],
  p_provider_models text[],
  p_measurement_snapshot jsonb,
  p_recommendation_snapshot jsonb,
  p_quota_exempt boolean
)
returns table (
  request_id uuid,
  outcome text,
  used_count bigint,
  limit_count integer,
  person_path text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_month date := pg_catalog.date_trunc('month', pg_catalog.now())::date;
  current_count bigint;
  existing_count integer;
  variant_count integer := coalesce(pg_catalog.array_length(p_request_ids, 1), 0);
  fixed_monthly_limit constant integer := 5;
  technical_variant_limit constant integer := 18;
  index_value integer;
  expected_path text;
  stored_row public.try_ons%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;
  if p_user_id is null or p_session_id is null then raise exception 'invalid identity'; end if;
  if p_quota_exempt is null then raise exception 'invalid quota mode'; end if;
  if p_product_id is null or pg_catalog.char_length(p_product_id) not between 1 and 120 then raise exception 'invalid product id'; end if;
  if p_product_url is null or pg_catalog.char_length(p_product_url) not between 1 and 2048 then raise exception 'invalid product url'; end if;
  if variant_count < 1
     or variant_count > (case when p_quota_exempt then technical_variant_limit else fixed_monthly_limit end) then
    raise exception 'invalid variant count';
  end if;
  if variant_count <> coalesce(pg_catalog.array_length(p_selected_sizes, 1), 0)
     or variant_count <> coalesce(pg_catalog.array_length(p_photo_views, 1), 0)
     or variant_count <> coalesce(pg_catalog.array_length(p_person_extensions, 1), 0)
     or variant_count <> coalesce(pg_catalog.array_length(p_fit_intents, 1), 0)
     or variant_count <> coalesce(pg_catalog.array_length(p_fit_scores, 1), 0)
     or variant_count <> coalesce(pg_catalog.array_length(p_size_recommendations, 1), 0)
     or variant_count <> coalesce(pg_catalog.array_length(p_provider_models, 1), 0) then
    raise exception 'variant manifest mismatch';
  end if;
  if p_measurement_snapshot is null or jsonb_typeof(p_measurement_snapshot) <> 'object'
     or pg_catalog.octet_length(p_measurement_snapshot::text) > 4096 then raise exception 'invalid measurement snapshot'; end if;
  if p_recommendation_snapshot is null or jsonb_typeof(p_recommendation_snapshot) <> 'object'
     or pg_catalog.octet_length(p_recommendation_snapshot::text) > 8192 then raise exception 'invalid recommendation snapshot'; end if;
  if (select count(*) from (select distinct value from pg_catalog.unnest(p_request_ids) value) unique_values) <> variant_count then
    raise exception 'duplicate request id';
  end if;
  if (select count(*) from (
    select distinct p_selected_sizes[position] || ':' || p_photo_views[position] as variant_key
    from pg_catalog.generate_subscripts(p_request_ids, 1) position
  ) unique_variants) <> variant_count then
    raise exception 'duplicate variant';
  end if;

  for index_value in 1..variant_count loop
    if p_selected_sizes[index_value] is null or pg_catalog.char_length(p_selected_sizes[index_value]) not between 1 and 10 then raise exception 'invalid selected size'; end if;
    if p_photo_views[index_value] is null or p_photo_views[index_value] <> all(array['front','back']::text[]) then raise exception 'invalid photo view'; end if;
    if p_person_extensions[index_value] is null or p_person_extensions[index_value] <> all(array['jpg','png','webp']::text[]) then raise exception 'invalid person extension'; end if;
    if p_fit_intents[index_value] is null or p_fit_intents[index_value] <> all(array['fitted','regular','relaxed']::text[]) then raise exception 'invalid fit intent'; end if;
    if p_fit_scores[index_value] is null or p_fit_scores[index_value] not between 0 and 100 then raise exception 'invalid fit score'; end if;
    if p_size_recommendations[index_value] is null or pg_catalog.char_length(p_size_recommendations[index_value]) > 20 then raise exception 'invalid recommendation'; end if;
    if p_provider_models[index_value] is null or pg_catalog.char_length(p_provider_models[index_value]) not between 1 and 120 then raise exception 'invalid provider model'; end if;
  end loop;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':' || current_month::text, 0)
  );
  select count(*) into current_count
  from public.try_on_usage usage
  join public.try_ons request
    on request.id = usage.request_id and request.user_id = usage.user_id
  where usage.user_id = p_user_id and usage.period_start = current_month
    and not request.quota_exempt
    and (usage.provider_started_at is not null or usage.claimed_at >= pg_catalog.now() - interval '15 minutes');

  select count(*) into existing_count from public.try_ons where id = any(p_request_ids);
  if existing_count > 0 then
    if existing_count <> variant_count or not exists (
      select 1 from public.try_on_sessions
      where id = p_session_id and user_id = p_user_id and product_id = p_product_id and product_url = p_product_url
    ) then
      return query select null::uuid, 'request_conflict'::text, current_count, fixed_monthly_limit, null::text;
      return;
    end if;
    for index_value in 1..variant_count loop
      expected_path := p_user_id::text || '/' || p_request_ids[index_value]::text || '/person.' || p_person_extensions[index_value];
      select * into stored_row from public.try_ons where id = p_request_ids[index_value] and user_id = p_user_id;
      if not found or stored_row.session_id <> p_session_id
         or stored_row.product_url <> p_product_url
         or stored_row.selected_size <> p_selected_sizes[index_value]
         or stored_row.photo_view <> p_photo_views[index_value]
         or stored_row.fit_intent <> p_fit_intents[index_value]
         or stored_row.fit_score <> p_fit_scores[index_value]
         or stored_row.size_recommendation <> p_size_recommendations[index_value]
         or stored_row.provider_model <> p_provider_models[index_value]
         or stored_row.quota_exempt <> p_quota_exempt
         or not (
           stored_row.source_path = expected_path
           or (stored_row.status = 'completed' and stored_row.source_path is null)
         ) then
        return query select null::uuid, 'request_conflict'::text, current_count, fixed_monthly_limit, null::text;
        return;
      end if;
    end loop;
    for index_value in 1..variant_count loop
      select * into stored_row from public.try_ons where id = p_request_ids[index_value] and user_id = p_user_id;
      return query select p_request_ids[index_value], 'existing'::text, current_count, fixed_monthly_limit,
        case when stored_row.status = 'completed' then null::text
          else p_user_id::text || '/' || p_request_ids[index_value]::text || '/person.' || p_person_extensions[index_value]
        end;
    end loop;
    return;
  end if;

  if exists (select 1 from public.try_on_sessions where id = p_session_id) then
    return query select null::uuid, 'request_conflict'::text, current_count, fixed_monthly_limit, null::text;
    return;
  end if;
  if not p_quota_exempt and current_count + variant_count > fixed_monthly_limit then
    return query select null::uuid, 'quota_exceeded'::text, current_count, fixed_monthly_limit, null::text;
    return;
  end if;

  insert into public.try_on_sessions (
    id, user_id, product_id, product_url, selected_sizes, selected_views,
    measurement_snapshot, recommendation_snapshot
  ) values (
    p_session_id, p_user_id, p_product_id, p_product_url,
    array(select distinct value from pg_catalog.unnest(p_selected_sizes) value),
    array(select distinct value from pg_catalog.unnest(p_photo_views) value),
    p_measurement_snapshot, p_recommendation_snapshot
  );

  for index_value in 1..variant_count loop
    expected_path := p_user_id::text || '/' || p_request_ids[index_value]::text || '/person.' || p_person_extensions[index_value];
    insert into public.try_ons (
      id, user_id, session_id, product_url, source_path, provider, provider_model,
      selected_size, photo_view, fit_intent, fit_score, size_recommendation, status, quota_exempt
    ) values (
      p_request_ids[index_value], p_user_id, p_session_id, p_product_url, expected_path, 'fal', p_provider_models[index_value],
      p_selected_sizes[index_value], p_photo_views[index_value], p_fit_intents[index_value],
      p_fit_scores[index_value], p_size_recommendations[index_value], 'processing', p_quota_exempt
    );
    insert into public.try_on_usage (request_id, user_id, period_start)
    values (p_request_ids[index_value], p_user_id, current_month);
  end loop;

  for index_value in 1..variant_count loop
    return query select p_request_ids[index_value], 'claimed'::text,
      current_count + case when p_quota_exempt then 0 else variant_count end,
      fixed_monthly_limit,
      p_user_id::text || '/' || p_request_ids[index_value]::text || '/person.' || p_person_extensions[index_value];
  end loop;
end;
$$;

revoke all on function public.claim_try_on_batch(uuid, uuid, text, text, uuid[], text[], text[], text[], text[], smallint[], text[], text[], jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.claim_try_on_batch(uuid, uuid, text, text, uuid[], text[], text[], text[], text[], smallint[], text[], text[], jsonb, jsonb, boolean) to service_role;

-- Preserve the original signature for normal-mode clients while keeping one
-- implementation of quota accounting.
create or replace function public.claim_try_on_batch(
  p_user_id uuid,
  p_session_id uuid,
  p_product_id text,
  p_product_url text,
  p_request_ids uuid[],
  p_selected_sizes text[],
  p_photo_views text[],
  p_person_extensions text[],
  p_fit_intents text[],
  p_fit_scores smallint[],
  p_size_recommendations text[],
  p_provider_models text[],
  p_measurement_snapshot jsonb,
  p_recommendation_snapshot jsonb
)
returns table (
  request_id uuid,
  outcome text,
  used_count bigint,
  limit_count integer,
  person_path text
)
language sql
security definer
set search_path = ''
as $$
  select * from public.claim_try_on_batch(
    p_user_id,
    p_session_id,
    p_product_id,
    p_product_url,
    p_request_ids,
    p_selected_sizes,
    p_photo_views,
    p_person_extensions,
    p_fit_intents,
    p_fit_scores,
    p_size_recommendations,
    p_provider_models,
    p_measurement_snapshot,
    p_recommendation_snapshot,
    false
  );
$$;

revoke all on function public.claim_try_on_batch(uuid, uuid, text, text, uuid[], text[], text[], text[], text[], smallint[], text[], text[], jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.claim_try_on_batch(uuid, uuid, text, text, uuid[], text[], text[], text[], text[], smallint[], text[], text[], jsonb, jsonb) to service_role;

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
  request_is_quota_exempt boolean;
  current_month date := pg_catalog.date_trunc('month', pg_catalog.now())::date;
  current_count bigint;
  fixed_monthly_limit constant integer := 5;
  reservation_is_active boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;
  if p_user_id is null then raise exception 'invalid user id'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':' || current_month::text, 0)
  );

  select * into usage_row from public.try_on_usage
  where request_id = p_request_id and user_id = p_user_id
  for update;
  if not found then raise exception 'usage reservation not found'; end if;

  select quota_exempt into request_is_quota_exempt
  from public.try_ons
  where id = p_request_id
    and user_id = p_user_id
    and status = 'processing'
    and provider = 'fal'
  for update;
  if not found then raise exception 'try-on request not ready'; end if;

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
  if not reservation_is_active and not request_is_quota_exempt then
    select count(*) into current_count
    from public.try_on_usage usage
    join public.try_ons request
      on request.id = usage.request_id and request.user_id = usage.user_id
    where usage.user_id = p_user_id
      and usage.period_start = current_month
      and not request.quota_exempt
      and (
        usage.provider_started_at is not null
        or usage.claimed_at >= pg_catalog.now() - interval '15 minutes'
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

revoke all on function public.begin_try_on_generation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.begin_try_on_generation(uuid, uuid) to service_role;

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
  if new.quota_exempt then return new; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('try-on-daily:' || new.user_id::text || ':' || current_day::text, 0)
  );
  select count(*) into daily_count
  from public.try_ons
  where user_id = new.user_id
    and created_at >= current_day
    and not quota_exempt;
  if daily_count >= fixed_daily_reservation_limit then
    raise exception 'daily reservation limit reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_try_on_daily_reservation_cap() from public, anon, authenticated;
grant execute on function public.enforce_try_on_daily_reservation_cap() to service_role;
