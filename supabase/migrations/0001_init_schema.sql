-- =====================================================================
-- Migration 0001 : schéma de base (produits + mouvements de stock)
-- Ordre d'exécution : 0001 -> 0002 -> 0003
-- À exécuter dans le SQL Editor de Supabase (ou via `supabase db push`).
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Table : produits
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  reference          text not null check (length(trim(reference)) > 0),
  name               text not null check (length(trim(name)) > 0),
  description        text,
  category           text,
  unit               text not null default 'pièce' check (length(trim(unit)) > 0),
  quantity           numeric(14, 3) not null default 0 check (quantity >= 0),
  low_stock_threshold numeric(14, 3) not null default 0 check (low_stock_threshold >= 0),
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint products_reference_unique_per_user unique (user_id, reference)
);

comment on column public.products.quantity is
  'Quantité disponible. Modifiable uniquement par les fonctions SQL (record_stock_*).';

create index if not exists products_user_id_idx        on public.products (user_id);
create index if not exists products_user_name_idx      on public.products (user_id, lower(name));
create index if not exists products_user_category_idx  on public.products (user_id, category);
create index if not exists products_user_active_idx    on public.products (user_id, is_active);
create index if not exists products_user_created_idx   on public.products (user_id, created_at desc);

-- Statut calculé côté base, utilisé pour filtrer le stock faible côté serveur.
alter table public.products
  add column if not exists stock_status text
  generated always as (
    case
      when quantity <= 0 then 'out'
      when quantity <= low_stock_threshold then 'low'
      else 'ok'
    end
  ) stored;

create index if not exists products_user_status_idx on public.products (user_id, stock_status);


-- ---------------------------------------------------------------------
-- Table : mouvements de stock
-- ---------------------------------------------------------------------
create table if not exists public.stock_movements (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  product_id        uuid not null references public.products (id) on delete restrict,
  type              text not null check (type in ('entry', 'exit', 'adjustment')),
  quantity          numeric(14, 3) not null check (quantity > 0),
  quantity_before   numeric(14, 3) not null check (quantity_before >= 0),
  quantity_after    numeric(14, 3) not null check (quantity_after >= 0),
  reason            text not null check (length(trim(reason)) > 0),
  comment           text,
  -- instantané des informations produit au moment du mouvement
  product_reference text not null,
  product_name      text not null,
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users (id) on delete set null,
  constraint stock_movements_values_check check (quantity_after <> quantity_before),
  constraint stock_movements_arithmetic_check check (
    (type = 'entry'     and quantity_after = quantity_before + quantity) or
    (type = 'exit'      and quantity_after = quantity_before - quantity) or
    (type = 'adjustment')
  )
);

comment on column public.stock_movements.product_name      is 'Nom du produit au moment du mouvement (historique figé).';
comment on column public.stock_movements.product_reference is 'Référence du produit au moment du mouvement (historique figé).';

create index if not exists stock_movements_user_idx      on public.stock_movements (user_id, created_at desc);
create index if not exists stock_movements_product_idx   on public.stock_movements (product_id, created_at desc);
create index if not exists stock_movements_user_type_idx on public.stock_movements (user_id, type, created_at desc);
create index if not exists stock_movements_user_reason_idx on public.stock_movements (user_id, reason);

-- ---------------------------------------------------------------------
-- Trigger : updated_at automatique
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- La quantité ne peut changer que par les fonctions record_stock_*.
-- Ces fonctions positionnent app.allow_quantity_change (transaction locale).
-- ---------------------------------------------------------------------
create or replace function public.assert_quantity_unchanged()
returns trigger
language plpgsql
as $$
begin
  if new.quantity is distinct from old.quantity
     and coalesce(current_setting('app.allow_quantity_change', true), 'false') <> 'true' then
    raise exception 'La quantité ne peut être modifiée que par un mouvement de stock.';
  end if;
  return new;
end;
$$;

drop trigger if exists products_guard_quantity on public.products;
create trigger products_guard_quantity
  before update on public.products
  for each row
  execute function public.assert_quantity_unchanged();


-- ---------------------------------------------------------------------
-- Vérification des quantités côté application (aucune écriture autorisée
-- directe depuis le client sur les mouvements).
-- ---------------------------------------------------------------------
alter table public.products       enable row level security;
alter table public.stock_movements enable row level security;

revoke all on table public.stock_movements from anon;
revoke insert, update, delete on table public.stock_movements from authenticated;
grant select on table public.stock_movements to authenticated;
