-- =====================================================================
-- Migration 0009 : auteur de chaque action dans l'espace partagé
--
-- Prérequis : 0007 -> 0008
-- Les données restent communes à l'espace ; created_by / cancelled_by
-- enregistrent le compte qui a réellement effectué l'action.
-- auth.uid() désigne toujours le compte connecté, y compris dans les
-- fonctions SECURITY DEFINER.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Colonnes d'auteur
-- ---------------------------------------------------------------------
alter table public.products
  add column if not exists created_by uuid default auth.uid() references auth.users (id) on delete set null;

alter table public.clients
  add column if not exists created_by uuid default auth.uid() references auth.users (id) on delete set null;

alter table public.sales
  add column if not exists created_by   uuid default auth.uid() references auth.users (id) on delete set null,
  add column if not exists cancelled_by uuid references auth.users (id) on delete set null;

alter table public.payments
  add column if not exists created_by   uuid default auth.uid() references auth.users (id) on delete set null,
  add column if not exists cancelled_by uuid references auth.users (id) on delete set null;

-- Les données existantes ont été saisies par le propriétaire de l'espace.
update public.products set created_by = user_id where created_by is null;
update public.clients  set created_by = user_id where created_by is null;
update public.sales    set created_by = user_id where created_by is null;
update public.payments set created_by = user_id where created_by is null;
update public.sales    set cancelled_by = user_id where status = 'cancelled' and cancelled_by is null;
update public.payments set cancelled_by = user_id where status = 'cancelled' and cancelled_by is null;


-- ---------------------------------------------------------------------
-- L'auteur ne peut pas être falsifié depuis le client.
-- ---------------------------------------------------------------------
create or replace function public.set_action_author()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    new.created_by := old.created_by;
  end if;

  if tg_table_name in ('sales', 'payments') then
    if new.status = 'cancelled' and (tg_op = 'INSERT' or old.status is distinct from 'cancelled') then
      new.cancelled_by := auth.uid();
    elsif tg_op = 'UPDATE' then
      new.cancelled_by := old.cancelled_by;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists products_set_author on public.products;
create trigger products_set_author
  before insert or update on public.products
  for each row execute function public.set_action_author();

drop trigger if exists clients_set_author on public.clients;
create trigger clients_set_author
  before insert or update on public.clients
  for each row execute function public.set_action_author();

drop trigger if exists sales_set_author on public.sales;
create trigger sales_set_author
  before insert or update on public.sales
  for each row execute function public.set_action_author();

drop trigger if exists payments_set_author on public.payments;
create trigger payments_set_author
  before insert or update on public.payments
  for each row execute function public.set_action_author();


-- ---------------------------------------------------------------------
-- Vues : exposition des auteurs (colonnes ajoutées en fin de vue)
-- ---------------------------------------------------------------------
create or replace view public.sale_balances
with (security_invoker = on) as
select
  s.id,
  s.user_id,
  s.reference,
  s.client_id,
  s.sale_date,
  s.subtotal,
  s.discount_amount,
  s.total_amount,
  s.status,
  s.comment,
  s.cancelled_at,
  s.cancel_comment,
  s.created_at,
  s.updated_at,
  c.name as client_name,
  c.code as client_code,
  case
    when s.status = 'cancelled'                 then 'cancelled'
    when s.total_amount <= 0                    then 'paid'
    when coalesce(p.paid_total, 0) <= 0         then 'unpaid'
    when coalesce(p.paid_total, 0) >= s.total_amount then 'paid'
    else 'partial'
  end as payment_status,
  coalesce(p.paid_total, 0) as paid_amount,
  case
    when s.status = 'cancelled' then 0::numeric
    when s.total_amount <= 0    then 0::numeric
    else greatest(s.total_amount - coalesce(p.paid_total, 0), 0)
  end as balance_due,
  coalesce(p.payments_count, 0) as payments_count,
  p.last_payment_at,
  s.created_by,
  s.cancelled_by
from public.sales s
left join public.clients c on c.id = s.client_id
left join (
  select
    sale_id,
    sum(amount) filter (where status = 'validated')  as paid_total,
    count(*) filter (where status = 'validated')     as payments_count,
    max(paid_at) filter (where status = 'validated') as last_payment_at
  from public.payments
  group by sale_id
) p on p.sale_id = s.id;

create or replace view public.client_balances
with (security_invoker = on) as
select
  c.id         as client_id,
  c.user_id,
  c.code,
  c.name,
  c.phone,
  c.email,
  c.address,
  c.is_active,
  c.created_at,
  c.updated_at,
  coalesce(sum(sb.total_amount) filter (where sb.status <> 'cancelled'), 0) as total_sales,
  coalesce(sum(sb.paid_amount)  filter (where sb.status <> 'cancelled'), 0) as total_paid,
  coalesce(sum(sb.balance_due)  filter (where sb.status <> 'cancelled'), 0) as balance_due,
  count(sb.id) filter (where sb.status <> 'cancelled')                as sales_count,
  count(sb.id) filter (where sb.status <> 'cancelled'
                         and sb.balance_due > 0)                      as open_sales_count,
  c.created_by
from public.clients c
left join public.sale_balances sb on sb.client_id = c.id
group by c.id, c.user_id, c.code, c.name, c.phone, c.email, c.address,
         c.is_active, c.created_at, c.updated_at, c.created_by;


-- ---------------------------------------------------------------------
-- Comptes de l'espace (pour afficher l'email de l'auteur)
-- ---------------------------------------------------------------------
create or replace function public.workspace_users()
returns table (id uuid, email text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id, u.email::text
  from auth.users u
  where u.id = public.current_workspace_id()
     or exists (
       select 1 from public.workspace_members wm
       where wm.user_id = u.id and wm.owner_id = public.current_workspace_id()
     )
  order by u.created_at;
$$;

revoke all on function public.workspace_users() from public, anon;
grant execute on function public.workspace_users() to authenticated;
