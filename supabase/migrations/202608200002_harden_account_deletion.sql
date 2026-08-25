revoke execute on function public.delete_own_account() from public, anon, authenticated;
drop function if exists public.delete_own_account();

create or replace function public.delete_user_account(p_user_id uuid)
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

  delete from auth.users where id = p_user_id;
  return found;
end;
$$;

revoke all on function public.delete_user_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_user_account(uuid) to service_role;
