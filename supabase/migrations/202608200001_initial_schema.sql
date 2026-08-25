create extension if not exists pgcrypto;

create type public.try_on_status as enum ('processing', 'completed', 'failed');
create type public.gender_option as enum ('female', 'male', 'other');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 80),
  gender public.gender_option,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.measurements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  height_cm smallint check (height_cm between 80 and 250),
  chest_cm smallint check (chest_cm between 40 and 200),
  waist_cm smallint check (waist_cm between 40 and 200),
  hip_cm smallint check (hip_cm between 40 and 200),
  updated_at timestamptz not null default now()
);

create table public.try_ons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_url text not null check (char_length(product_url) <= 2048),
  source_path text,
  result_path text,
  fit_score smallint check (fit_score between 0 and 100),
  size_recommendation text check (char_length(size_recommendation) <= 20),
  status public.try_on_status not null default 'processing',
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.looks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  try_on_id uuid not null references public.try_ons(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  created_at timestamptz not null default now(),
  unique (user_id, try_on_id)
);

create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null check (topic in ('try-on', 'account', 'quota')),
  email text not null check (char_length(email) <= 254),
  message text not null check (char_length(message) between 10 and 2000),
  created_at timestamptz not null default now()
);

create index try_ons_user_created_idx on public.try_ons (user_id, created_at desc);
create index looks_user_created_idx on public.looks (user_id, created_at desc);
create index support_requests_user_created_idx on public.support_requests (user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger measurements_set_updated_at before update on public.measurements
for each row execute function public.set_updated_at();
create trigger try_ons_set_updated_at before update on public.try_ons
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (user_id, full_name, gender)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case new.raw_user_meta_data ->> 'gender'
      when 'female' then 'female'::public.gender_option
      when 'male' then 'male'::public.gender_option
      when 'other' then 'other'::public.gender_option
      else null
    end
  );
  insert into public.measurements (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.measurements enable row level security;
alter table public.try_ons enable row level security;
alter table public.looks enable row level security;
alter table public.support_requests enable row level security;

create policy "profiles_select_own" on public.profiles for select to authenticated
using ((select auth.uid()) = user_id);
create policy "profiles_update_own" on public.profiles for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "measurements_select_own" on public.measurements for select to authenticated
using ((select auth.uid()) = user_id);
create policy "measurements_update_own" on public.measurements for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "try_ons_select_own" on public.try_ons for select to authenticated
using ((select auth.uid()) = user_id);
create policy "try_ons_insert_own" on public.try_ons for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "try_ons_delete_own" on public.try_ons for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "looks_select_own" on public.looks for select to authenticated
using ((select auth.uid()) = user_id);
create policy "looks_insert_own" on public.looks for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.try_ons
    where try_ons.id = try_on_id and try_ons.user_id = (select auth.uid())
  )
);
create policy "looks_delete_own" on public.looks for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "support_insert_own" on public.support_requests for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "support_select_own" on public.support_requests for select to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('user-photos', 'user-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "user_photos_select_own" on storage.objects for select to authenticated
using (bucket_id = 'user-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "user_photos_insert_own" on storage.objects for insert to authenticated
with check (bucket_id = 'user-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "user_photos_update_own" on storage.objects for update to authenticated
using (bucket_id = 'user-photos' and (storage.foldername(name))[1] = (select auth.uid()::text))
with check (bucket_id = 'user-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "user_photos_delete_own" on storage.objects for delete to authenticated
using (bucket_id = 'user-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = current_user_id;
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
