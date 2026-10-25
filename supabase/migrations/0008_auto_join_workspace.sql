-- =====================================================================
-- Migration 0008 : tous les comptes partagent le même espace de travail
--
-- Prérequis : 0007
-- L'espace principal appartient au plus ancien compte non rattaché.
-- Tout compte créé ensuite y est rattaché automatiquement ; le tout
-- premier compte d'une base vide devient propriétaire.
-- =====================================================================

create or replace function public.primary_workspace_owner(p_exclude uuid default null)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id
  from auth.users u
  where u.id is distinct from p_exclude
    and not exists (select 1 from public.workspace_members wm where wm.user_id = u.id)
  order by u.created_at, u.id
  limit 1;
$$;

revoke all on function public.primary_workspace_owner(uuid) from public, anon, authenticated;

create or replace function public.join_primary_workspace()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := public.primary_workspace_owner(new.id);
begin
  if v_owner is not null then
    insert into public.workspace_members (user_id, owner_id)
    values (new.id, v_owner)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.join_primary_workspace() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_join_workspace on auth.users;
create trigger on_auth_user_created_join_workspace
  after insert on auth.users
  for each row
  execute function public.join_primary_workspace();

-- Rattache les comptes existants qui ne le sont pas encore.
insert into public.workspace_members (user_id, owner_id)
select u.id, o.owner_id
from auth.users u
cross join (select public.primary_workspace_owner() as owner_id) o
where o.owner_id is not null
  and u.id <> o.owner_id
  and not exists (select 1 from public.workspace_members wm where wm.user_id = u.id)
on conflict (user_id) do nothing;
