alter table public.measurements
  drop constraint measurements_usual_bottom_size_check;

alter table public.measurements
  add constraint measurements_usual_bottom_size_check
  check (
    usual_bottom_size is null
    or case when usual_bottom_size ~ '^[0-9]{2}$' then
      (bottom_size_system = 'EU' and usual_bottom_size::integer between 32 and 60)
      or (bottom_size_system = 'W' and usual_bottom_size::integer between 24 and 44)
    else false end
  );

create or replace function public.update_own_profile(
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

drop policy if exists "looks_update_own" on public.looks;
create policy "looks_update_own" on public.looks for update to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (group_id is null or exists (
    select 1 from public.look_groups where id = group_id and user_id = (select auth.uid())
  ))
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
