alter table public.measurements
  add column if not exists usual_top_size text,
  add column if not exists usual_bottom_size text,
  add column if not exists bottom_size_system text not null default 'EU';

alter table public.measurements
  add constraint measurements_usual_top_size_check
    check (usual_top_size is null or usual_top_size = any(array['XXS','XS','S','M','L','XL','XXL','3XL','4XL']::text[])),
  add constraint measurements_bottom_size_system_check
    check (bottom_size_system = any(array['EU','W']::text[])),
  add constraint measurements_usual_bottom_size_check
    check (
      usual_bottom_size is null
      or (
        usual_bottom_size ~ '^[0-9]{2}$'
        and (
          (bottom_size_system = 'EU' and usual_bottom_size::integer between 32 and 60)
          or (bottom_size_system = 'W' and usual_bottom_size::integer between 24 and 44)
        )
      )
    );

drop function if exists public.update_own_profile(text, public.gender_option, smallint, smallint, smallint, smallint);

create function public.update_own_profile(
  p_full_name text,
  p_gender public.gender_option,
  p_height_cm smallint,
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
    p_usual_bottom_size ~ '^[0-9]{2}$'
    and (
      (p_bottom_size_system = 'EU' and p_usual_bottom_size::integer between 32 and 60)
      or (p_bottom_size_system = 'W' and p_usual_bottom_size::integer between 24 and 44)
    )
  ) then
    raise exception 'invalid bottom size';
  end if;

  update public.profiles
  set full_name = pg_catalog.btrim(p_full_name), gender = p_gender
  where user_id = current_user_id;
  if not found then raise exception 'profile not found'; end if;

  update public.measurements
  set height_cm = p_height_cm,
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

revoke all on function public.update_own_profile(text, public.gender_option, smallint, smallint, smallint, smallint, text, text, text) from public, anon;
grant execute on function public.update_own_profile(text, public.gender_option, smallint, smallint, smallint, smallint, text, text, text) to authenticated;

create table public.try_on_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null check (pg_catalog.char_length(product_id) between 1 and 120),
  product_url text not null check (pg_catalog.char_length(product_url) between 1 and 2048),
  selected_sizes text[] not null check (pg_catalog.cardinality(selected_sizes) between 1 and 5),
  selected_views text[] not null check (pg_catalog.cardinality(selected_views) between 1 and 2),
  measurement_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(measurement_snapshot) = 'object'),
  recommendation_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(recommendation_snapshot) = 'object'),
  created_at timestamptz not null default pg_catalog.now()
);

create index try_on_sessions_user_created_idx on public.try_on_sessions (user_id, created_at desc);
alter table public.try_on_sessions enable row level security;
create policy "try_on_sessions_select_own" on public.try_on_sessions for select to authenticated
using ((select auth.uid()) = user_id);
revoke all on table public.try_on_sessions from public, anon, authenticated;
grant select on table public.try_on_sessions to authenticated;
grant all on table public.try_on_sessions to service_role;

alter table public.try_ons
  add column if not exists session_id uuid references public.try_on_sessions(id) on delete cascade,
  add column if not exists selected_size text,
  add column if not exists photo_view text,
  add column if not exists fit_intent text,
  add column if not exists provider_model text;

alter table public.try_ons
  add constraint try_ons_selected_size_check check (selected_size is null or pg_catalog.char_length(selected_size) between 1 and 10),
  add constraint try_ons_photo_view_check check (photo_view is null or photo_view = any(array['front','back']::text[])),
  add constraint try_ons_fit_intent_check check (fit_intent is null or fit_intent = any(array['fitted','regular','relaxed']::text[])),
  add constraint try_ons_provider_model_check check (provider_model is null or pg_catalog.char_length(provider_model) between 1 and 120);

create unique index try_ons_session_variant_idx
  on public.try_ons (session_id, selected_size, photo_view)
  where session_id is not null;

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
  index_value integer;
  expected_path text;
  stored_row public.try_ons%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;
  if p_user_id is null or p_session_id is null then raise exception 'invalid identity'; end if;
  if p_product_id is null or pg_catalog.char_length(p_product_id) not between 1 and 120 then raise exception 'invalid product id'; end if;
  if p_product_url is null or pg_catalog.char_length(p_product_url) not between 1 and 2048 then raise exception 'invalid product url'; end if;
  if variant_count < 1 or variant_count > fixed_monthly_limit then raise exception 'invalid variant count'; end if;
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
  from public.try_on_usage
  where user_id = p_user_id and period_start = current_month
    and (provider_started_at is not null or claimed_at >= pg_catalog.now() - interval '15 minutes');

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
  if current_count + variant_count > fixed_monthly_limit then
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
      selected_size, photo_view, fit_intent, fit_score, size_recommendation, status
    ) values (
      p_request_ids[index_value], p_user_id, p_session_id, p_product_url, expected_path, 'fal', p_provider_models[index_value],
      p_selected_sizes[index_value], p_photo_views[index_value], p_fit_intents[index_value],
      p_fit_scores[index_value], p_size_recommendations[index_value], 'processing'
    );
    insert into public.try_on_usage (request_id, user_id, period_start)
    values (p_request_ids[index_value], p_user_id, current_month);
  end loop;

  for index_value in 1..variant_count loop
    return query select p_request_ids[index_value], 'claimed'::text, current_count + variant_count, fixed_monthly_limit,
      p_user_id::text || '/' || p_request_ids[index_value]::text || '/person.' || p_person_extensions[index_value];
  end loop;
end;
$$;

revoke all on function public.claim_try_on_batch(uuid, uuid, text, text, uuid[], text[], text[], text[], text[], smallint[], text[], text[], jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.claim_try_on_batch(uuid, uuid, text, text, uuid[], text[], text[], text[], text[], smallint[], text[], text[], jsonb, jsonb) to service_role;

-- Keep recommendation metadata after a successful provider transition.
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
  if p_user_id is null then raise exception 'invalid user id'; end if;
  if p_provider_request_id is null or pg_catalog.char_length(p_provider_request_id) not between 1 and 200 then raise exception 'invalid provider request id'; end if;
  if p_result_path is null or not (p_result_path = any(array[
    p_user_id::text || '/' || p_request_id::text || '/result.jpg',
    p_user_id::text || '/' || p_request_id::text || '/result.png',
    p_user_id::text || '/' || p_request_id::text || '/result.webp'
  ]::text[])) then raise exception 'invalid result path'; end if;

  update public.try_ons
  set source_path = null, garment_path = null, result_path = p_result_path,
      status = 'completed', error_code = null
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

create table public.look_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 60),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create unique index look_groups_user_name_idx on public.look_groups (user_id, lower(name));
create index look_groups_user_created_idx on public.look_groups (user_id, created_at desc);
create trigger look_groups_set_updated_at before update on public.look_groups
for each row execute function public.set_updated_at();

alter table public.looks alter column try_on_id drop not null;
alter table public.looks
  add column if not exists try_on_session_id uuid references public.try_on_sessions(id) on delete cascade,
  add column if not exists group_id uuid references public.look_groups(id) on delete set null,
  add column if not exists cover_try_on_id uuid references public.try_ons(id) on delete set null;
alter table public.looks add constraint looks_single_source_check check (
  (try_on_id is not null and try_on_session_id is null)
  or (try_on_id is null and try_on_session_id is not null)
);
create unique index looks_user_session_idx on public.looks (user_id, try_on_session_id) where try_on_session_id is not null;

alter table public.look_groups enable row level security;
revoke all on table public.look_groups from public, anon, authenticated;
grant select, insert, update, delete on table public.look_groups to authenticated;
grant all on table public.look_groups to service_role;
create policy "look_groups_select_own" on public.look_groups for select to authenticated using ((select auth.uid()) = user_id);
create policy "look_groups_insert_own" on public.look_groups for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "look_groups_update_own" on public.look_groups for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "look_groups_delete_own" on public.look_groups for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "looks_insert_own" on public.looks;
drop policy if exists "looks_update_own" on public.looks;
create policy "looks_insert_own" on public.looks for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and (group_id is null or exists (select 1 from public.look_groups where id = group_id and user_id = (select auth.uid())))
  and (cover_try_on_id is null or exists (
    select 1 from public.try_ons
    where id = cover_try_on_id and user_id = (select auth.uid())
      and (try_on_session_id is null or session_id = try_on_session_id)
  ))
);
create policy "looks_update_own" on public.looks for update to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (group_id is null or exists (select 1 from public.look_groups where id = group_id and user_id = (select auth.uid())))
  and (
    (try_on_id is not null and try_on_session_id is null and exists (
      select 1 from public.try_ons where id = try_on_id and user_id = (select auth.uid())
    ))
    or
    (try_on_id is null and try_on_session_id is not null and exists (
      select 1 from public.try_on_sessions where id = try_on_session_id and user_id = (select auth.uid())
    ))
  )
  and (cover_try_on_id is null or exists (
    select 1 from public.try_ons where id = cover_try_on_id and user_id = (select auth.uid())
      and (try_on_session_id is null or session_id = try_on_session_id)
  ))
);
