-- =====================================================================
-- Migration 0005 : clients, ventes, lignes de vente et paiements
--
-- Prérequis : 0001 -> 0002 -> 0003 -> 0004
-- Conserve intégralement les tables existantes (products, stock_movements)
-- et leur mécanique de mouvements.
--
-- Principles :
--   * montants en Ariary, precision numeric(16, 2)
--   * prix unitaire fige dans sale_items (historique immuable)
--   * ecritures des ventes/paiements réservées aux fonctions SQL (0006)
--   * RLS active sur toutes les nouvelles tables
-- =====================================================================

-- ---------------------------------------------------------------------
-- Prix de vente sur les produits
-- ---------------------------------------------------------------------
alter table public.products
  add column if not exists sale_price numeric(16, 2) not null default 0
  check (sale_price >= 0);

comment on column public.products.sale_price is
  'Prix de vente unitaire en Ariary. Les anciennes ventes conservent leur propre prix.';


-- ---------------------------------------------------------------------
-- Compteurs de references (CLI-0001, VTE-0001, PAY-0001)
-- Table interne : aucun acces direct depuis le client.
-- ---------------------------------------------------------------------
create table if not exists public.id_counters (
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null,
  last_value bigint not null default 0,
  primary key (user_id, kind)
);

alter table public.id_counters enable row level security;
revoke all on table public.id_counters from anon;
revoke all on table public.id_counters from authenticated;

-- Incremente le compteur de l'utilisateur courant de maniere atomique.
-- Le verrou advisory transactionnel garantit un numéro unique même en
-- cas de requêtes simultanees (meme si la contrainte unique reste le
-- garde-fou final).
create or replace function public.next_reference_value(p_kind text)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_value bigint;
begin
  if v_uid is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;

  if p_kind is null or length(trim(p_kind)) = 0 then
    raise exception 'Type de référence invalide.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ran-ref:' || trim(p_kind) || ':' || v_uid::text, 0));

  insert into public.id_counters (user_id, kind, last_value)
  values (v_uid, trim(p_kind), 1)
  on conflict (user_id, kind)
  do update set last_value = public.id_counters.last_value + 1
  returning last_value into v_value;

  return v_value;
end;
$$;

revoke all on function public.next_reference_value(text) from public, anon;
grant execute on function public.next_reference_value(text) to authenticated;


-- ---------------------------------------------------------------------
-- Table : clients
-- ---------------------------------------------------------------------
create table if not exists public.clients (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  code       text not null default '',
  name       text not null check (length(trim(name)) > 0),
  phone      text,
  email      text,
  address    text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clients_code_not_empty check (length(trim(code)) > 0),
  constraint clients_code_unique_per_user unique (user_id, code)
);

create index if not exists clients_user_id_idx      on public.clients (user_id);
create index if not exists clients_user_name_idx    on public.clients (user_id, lower(name));
create index if not exists clients_user_code_idx    on public.clients (user_id, code);
create index if not exists clients_user_active_idx  on public.clients (user_id, is_active);
create index if not exists clients_user_phone_idx   on public.clients (user_id, phone);
create index if not exists clients_user_created_idx on public.clients (user_id, created_at desc);

-- Code client genere automatiquement quand il n'est pas fourni.
create or replace function public.assign_client_code()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.code is null or length(trim(new.code)) = 0 then
    new.code := 'CLI-' || lpad(public.next_reference_value('client')::text, 4, '0');
  else
    new.code := upper(trim(new.code));
  end if;
  return new;
end;
$$;

drop trigger if exists clients_assign_code on public.clients;
create trigger clients_assign_code
  before insert on public.clients
  for each row
  execute function public.assign_client_code();


-- ---------------------------------------------------------------------
-- Table : ventes
-- ---------------------------------------------------------------------
create table if not exists public.sales (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  reference       text not null,
  client_id       uuid not null references public.clients (id) on delete restrict,
  sale_date       date not null default current_date,
  subtotal        numeric(16, 2) not null default 0 check (subtotal >= 0),
  discount_amount numeric(16, 2) not null default 0 check (discount_amount >= 0),
  total_amount    numeric(16, 2) not null default 0 check (total_amount >= 0),
  payment_status  text not null default 'unpaid'
                    check (payment_status in ('unpaid', 'partial', 'paid', 'cancelled')),
  status          text not null default 'validated'
                    check (status in ('validated', 'cancelled')),
  comment         text,
  cancelled_at    timestamptz,
  cancel_comment  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint sales_reference_unique_per_user unique (user_id, reference),
  constraint sales_discount_within_subtotal check (discount_amount <= subtotal),
  constraint sales_total_matches check (total_amount = subtotal - discount_amount)
);

create index if not exists sales_user_id_idx        on public.sales (user_id);
create index if not exists sales_user_date_idx      on public.sales (user_id, sale_date desc);
create index if not exists sales_user_status_idx    on public.sales (user_id, status, sale_date desc);
create index if not exists sales_user_payment_idx    on public.sales (user_id, payment_status);
create index if not exists sales_client_idx         on public.sales (client_id, sale_date desc);


-- ---------------------------------------------------------------------
-- Table : lignes de vente (prix et libelles figes)
-- ---------------------------------------------------------------------
create table if not exists public.sale_items (
  id                        uuid primary key default gen_random_uuid(),
  sale_id                   uuid not null references public.sales (id) on delete cascade,
  product_id                uuid not null references public.products (id) on delete restrict,
  product_reference_snapshot text not null,
  product_name_snapshot     text not null,
  quantity                  numeric(14, 3) not null check (quantity > 0),
  unit_price                numeric(16, 2) not null check (unit_price >= 0),
  line_total                numeric(16, 2) not null check (line_total >= 0),
  constraint sale_items_total_formula check (line_total = round(quantity * unit_price, 2))
);

comment on column public.sale_items.unit_price is
  'Prix unitaire reellement applique a la vente : ne suit pas les changements de prix du produit.';
comment on column public.sale_items.product_name_snapshot is
  'Nom du produit au moment de la vente (historique fige).';

create index if not exists sale_items_sale_idx    on public.sale_items (sale_id);
create index if not exists sale_items_product_idx on public.sale_items (product_id);


-- ---------------------------------------------------------------------
-- Table : paiements
-- ---------------------------------------------------------------------
create table if not exists public.payments (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  reference            text not null,
  sale_id              uuid not null references public.sales (id) on delete restrict,
  client_id            uuid not null references public.clients (id) on delete restrict,
  amount               numeric(16, 2) not null check (amount > 0),
  payment_method       text not null
                         check (payment_method in ('cash', 'mobile_money', 'bank_transfer', 'check', 'other')),
  transaction_reference text,
  status               text not null default 'validated'
                         check (status in ('pending', 'validated', 'cancelled')),
  paid_at              timestamptz not null default now(),
  comment              text,
  cancelled_at         timestamptz,
  cancel_comment       text,
  created_at           timestamptz not null default now(),
  constraint payments_reference_unique_per_user unique (user_id, reference)
);

comment on column public.payments.status is
  'validated = encaisse ; cancelled = annule (trace conservee, jamais supprime).';

create index if not exists payments_user_id_idx     on public.payments (user_id);
create index if not exists payments_user_paid_idx   on public.payments (user_id, paid_at desc);
create index if not exists payments_user_status_idx on public.payments (user_id, status, paid_at desc);
create index if not exists payments_sale_idx        on public.payments (sale_id, paid_at);
create index if not exists payments_client_idx      on public.payments (client_id, paid_at desc);


-- ---------------------------------------------------------------------
-- Triggers : updated_at
-- ---------------------------------------------------------------------
drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at
  before update on public.clients
  for each row
  execute function public.set_updated_at();

drop trigger if exists sales_set_updated_at on public.sales;
create trigger sales_set_updated_at
  before update on public.sales
  for each row
  execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- Politiques RLS
-- ---------------------------------------------------------------------
alter table public.clients   enable row level security;
alter table public.sales     enable row level security;
alter table public.sale_items enable row level security;
alter table public.payments  enable row level security;

-- clients : lecture / creation / modification / archivage proprietaires.
drop policy if exists "clients_select_own" on public.clients;
create policy "clients_select_own"
  on public.clients for select
  using (auth.uid() = user_id);

drop policy if exists "clients_insert_own" on public.clients;
create policy "clients_insert_own"
  on public.clients for insert
  with check (auth.uid() = user_id);

drop policy if exists "clients_update_own" on public.clients;
create policy "clients_update_own"
  on public.clients for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Un client ayant des ventes ou des paiements ne peut pas etre supprime
-- (les cles etrangeres le bloquent aussi, mais la politique donne un
-- message clair et évite de toucher a la table).
drop policy if exists "clients_delete_own" on public.clients;
create policy "clients_delete_own"
  on public.clients for delete
  using (
    auth.uid() = user_id
    and not exists (select 1 from public.sales s     where s.client_id = clients.id)
    and not exists (select 1 from public.payments p  where p.client_id = clients.id)
  );

-- sales / payments : lecture seule pour le client.
-- Les ecritures passent exclusivement par les fonctions SQL (0006).
drop policy if exists "sales_select_own" on public.sales;
create policy "sales_select_own"
  on public.sales for select
  using (auth.uid() = user_id);

drop policy if exists "payments_select_own" on public.payments;
create policy "payments_select_own"
  on public.payments for select
  using (auth.uid() = user_id);

-- sale_items n'a pas de user_id : on remonte a la vente mere.
drop policy if exists "sale_items_select_own" on public.sale_items;
create policy "sale_items_select_own"
  on public.sale_items for select
  using (
    exists (
      select 1 from public.sales s
      where s.id = sale_items.sale_id and s.user_id = auth.uid()
    )
  );

-- Aucune politique INSERT / UPDATE / DELETE sur sales, sale_items, payments :
-- les ecritures sont reservees aux fonctions SECURITY DEFINER.

-- Retraits des droits d'ecriture directs (la lecture reste autorisee).
revoke all on table public.sales      from anon;
revoke all on table public.sale_items from anon;
revoke all on table public.payments   from anon;
revoke all on table public.clients    from anon;

revoke insert, update, delete on table public.sales      from authenticated;
revoke insert, update, delete on table public.sale_items from authenticated;
revoke insert, update, delete on table public.payments   from authenticated;

grant select on table public.sales      to authenticated;
grant select on table public.sale_items to authenticated;
grant select on table public.payments   to authenticated;
grant select, insert, update, delete on table public.clients to authenticated;


-- ---------------------------------------------------------------------
-- Realtime : mise a jour automatique des listes (autre onglet / mobile)
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'clients'
  ) then
    alter publication supabase_realtime add table public.clients;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sales'
  ) then
    alter publication supabase_realtime add table public.sales;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payments'
  ) then
    alter publication supabase_realtime add table public.payments;
  end if;
end;
$$;
