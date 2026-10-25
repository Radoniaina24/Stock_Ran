-- =====================================================================
-- Migration 0007 : espace de travail partagé entre plusieurs comptes
--
-- Prérequis : 0001 -> 0006
-- La colonne user_id des tables métier désigne désormais l'espace de
-- travail (le compte propriétaire). Un compte rattaché via
-- workspace_members voit et modifie les données de son propriétaire ;
-- un compte non rattaché reste propriétaire de son propre espace.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Rattachement des comptes à un espace
-- ---------------------------------------------------------------------
create table if not exists public.workspace_members (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  owner_id   uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint workspace_members_not_self check (user_id <> owner_id)
);

create index if not exists workspace_members_owner_idx on public.workspace_members (owner_id);

alter table public.workspace_members enable row level security;
revoke all on table public.workspace_members from anon;
revoke all on table public.workspace_members from authenticated;

-- Espace de travail du compte connecté (null si non authentifié).
create or replace function public.current_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select wm.owner_id from public.workspace_members wm where wm.user_id = auth.uid()),
    auth.uid()
  );
$$;

revoke all on function public.current_workspace_id() from public, anon;
grant execute on function public.current_workspace_id() to authenticated;


-- ---------------------------------------------------------------------
-- Politiques RLS : filtrage par espace au lieu du compte connecté
-- (le sous-select évalue la fonction une seule fois par requête)
-- ---------------------------------------------------------------------
drop policy if exists "products_select_own" on public.products;
create policy "products_select_own"
  on public.products for select
  using (user_id = (select public.current_workspace_id()));

drop policy if exists "products_insert_own" on public.products;
create policy "products_insert_own"
  on public.products for insert
  with check (user_id = (select public.current_workspace_id()));

drop policy if exists "products_update_own" on public.products;
create policy "products_update_own"
  on public.products for update
  using (user_id = (select public.current_workspace_id()))
  with check (user_id = (select public.current_workspace_id()));

drop policy if exists "products_delete_own" on public.products;
create policy "products_delete_own"
  on public.products for delete
  using (
    user_id = (select public.current_workspace_id())
    and not exists (
      select 1 from public.stock_movements sm where sm.product_id = products.id
    )
  );

drop policy if exists "movements_select_own" on public.stock_movements;
create policy "movements_select_own"
  on public.stock_movements for select
  using (user_id = (select public.current_workspace_id()));

drop policy if exists "clients_select_own" on public.clients;
create policy "clients_select_own"
  on public.clients for select
  using (user_id = (select public.current_workspace_id()));

drop policy if exists "clients_insert_own" on public.clients;
create policy "clients_insert_own"
  on public.clients for insert
  with check (user_id = (select public.current_workspace_id()));

drop policy if exists "clients_update_own" on public.clients;
create policy "clients_update_own"
  on public.clients for update
  using (user_id = (select public.current_workspace_id()))
  with check (user_id = (select public.current_workspace_id()));

drop policy if exists "clients_delete_own" on public.clients;
create policy "clients_delete_own"
  on public.clients for delete
  using (
    user_id = (select public.current_workspace_id())
    and not exists (select 1 from public.sales s    where s.client_id = clients.id)
    and not exists (select 1 from public.payments p where p.client_id = clients.id)
  );

drop policy if exists "sales_select_own" on public.sales;
create policy "sales_select_own"
  on public.sales for select
  using (user_id = (select public.current_workspace_id()));

drop policy if exists "payments_select_own" on public.payments;
create policy "payments_select_own"
  on public.payments for select
  using (user_id = (select public.current_workspace_id()));

drop policy if exists "sale_items_select_own" on public.sale_items;
create policy "sale_items_select_own"
  on public.sale_items for select
  using (
    exists (
      select 1 from public.sales s
      where s.id = sale_items.sale_id and s.user_id = (select public.current_workspace_id())
    )
  );


-- ---------------------------------------------------------------------
-- Fonctions métier : même logique, appliquée à l'espace de travail.
-- Les corps (0003, 0005, 0006) sont repris tels quels, seul auth.uid()
-- est remplacé ; droits d'exécution et options sont conservés.
-- ---------------------------------------------------------------------
do $$
declare
  v_fn  record;
  v_def text;
begin
  for v_fn in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'record_stock_entry',
        'record_stock_exit',
        'record_stock_adjustment',
        'next_reference_value',
        'create_sale',
        'record_payment',
        'cancel_payment',
        'cancel_sale'
      )
  loop
    v_def := pg_get_functiondef(v_fn.oid);
    if position('auth.uid()' in v_def) > 0 then
      execute replace(v_def, 'auth.uid()', 'public.current_workspace_id()');
    end if;
  end loop;
end;
$$;


-- ---------------------------------------------------------------------
-- created_by garde l'auteur réel du mouvement, pas le propriétaire.
-- ---------------------------------------------------------------------
create or replace function public.set_movement_author()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists stock_movements_set_author on public.stock_movements;
create trigger stock_movements_set_author
  before insert on public.stock_movements
  for each row
  execute function public.set_movement_author();
