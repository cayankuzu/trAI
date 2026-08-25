create or replace function public.update_own_profile(
  p_full_name text,
  p_gender public.gender_option,
  p_height_cm smallint,
  p_chest_cm smallint,
  p_waist_cm smallint,
  p_hip_cm smallint
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
  if p_height_cm is not null and p_height_cm not between 80 and 250 then
    raise exception 'invalid height';
  end if;
  if p_chest_cm is not null and p_chest_cm not between 40 and 200 then
    raise exception 'invalid chest';
  end if;
  if p_waist_cm is not null and p_waist_cm not between 40 and 200 then
    raise exception 'invalid waist';
  end if;
  if p_hip_cm is not null and p_hip_cm not between 40 and 200 then
    raise exception 'invalid hip';
  end if;

  update public.profiles
  set full_name = pg_catalog.btrim(p_full_name),
      gender = p_gender
  where user_id = current_user_id;
  if not found then raise exception 'profile not found'; end if;

  update public.measurements
  set height_cm = p_height_cm,
      chest_cm = p_chest_cm,
      waist_cm = p_waist_cm,
      hip_cm = p_hip_cm
  where user_id = current_user_id;
  if not found then raise exception 'measurements not found'; end if;

  return true;
end;
$$;

revoke all on function public.update_own_profile(text, public.gender_option, smallint, smallint, smallint, smallint) from public, anon;
grant execute on function public.update_own_profile(text, public.gender_option, smallint, smallint, smallint, smallint) to authenticated;
