-- =====================================================================
-- Migration 0003 : fonctions transactionnelles de gestion de stock
--
-- Chaque fonction :
--   1. vérifie l'identité (auth.uid())
--   2. vérifie que le produit appartient à l'utilisateur
--   3. verrouille la ligne produit (SELECT ... FOR UPDATE)
--   4. valide la quantité
--   5. vérifie le stock disponible (sortie)
--   6. insère le mouvement
--   7. met à jour la quantité
--   8. retourne le mouvement créé
-- Le tout dans UNE SEULE transaction (fonction plpgsql = transaction).
--
-- Le verrouillage séquentiel de la ligne produit garantit que deux
-- sorties simultanées ne peuvent jamais rendre le stock négatif.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Entrée de stock
-- ---------------------------------------------------------------------
create or replace function public.record_stock_entry(
  p_product_id uuid,
  p_quantity   numeric,
  p_reason     text,
  p_comment    text default null
)
returns public.stock_movements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := auth.uid();
  v_product   public.products%rowtype;
  v_movement  public.stock_movements%rowtype;
  v_quantity  numeric;
begin
  if v_uid is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;

  v_quantity := round(coalesce(p_quantity, 0)::numeric, 3);

  if v_quantity is null or v_quantity <= 0 then
    raise exception 'La quantité doit être strictement supérieure à zéro.';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Le motif est obligatoire.';
  end if;

  -- verrou de ligne : sérialise les écritures concurrentes sur ce produit
  select * into v_product
  from public.products
  where id = p_product_id and user_id = v_uid
  for update;

  if not found then
    raise exception 'Produit introuvable.';
  end if;

  if not v_product.is_active then
    raise exception 'Ce produit est archivé et ne peut plus être modifié.';
  end if;

  insert into public.stock_movements (
    user_id, product_id, type, quantity,
    quantity_before, quantity_after,
    reason, comment, product_reference, product_name, created_by
  ) values (
    v_uid, p_product_id, 'entry', v_quantity,
    v_product.quantity, v_product.quantity + v_quantity,
    trim(p_reason),
    nullif(trim(coalesce(p_comment, '')), ''),
    v_product.reference, v_product.name, v_uid
  )
  returning * into v_movement;

  -- autorise la modification de la quantité (trigger products_guard_quantity)
  perform set_config('app.allow_quantity_change', 'true', true);

  update public.products
  set quantity = quantity + v_quantity
  where id = p_product_id;

  return v_movement;
end;
$$;

-- ---------------------------------------------------------------------
-- Sortie de stock
-- ---------------------------------------------------------------------
create or replace function public.record_stock_exit(
  p_product_id uuid,
  p_quantity   numeric,
  p_reason     text,
  p_comment    text default null
)
returns public.stock_movements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := auth.uid();
  v_product   public.products%rowtype;
  v_movement  public.stock_movements%rowtype;
  v_quantity  numeric;
begin
  if v_uid is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;

  v_quantity := round(coalesce(p_quantity, 0)::numeric, 3);

  if v_quantity is null or v_quantity <= 0 then
    raise exception 'La quantité doit être strictement supérieure à zéro.';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Le motif est obligatoire.';
  end if;

  -- verrou de ligne : la vérification du stock est atomique
  select * into v_product
  from public.products
  where id = p_product_id and user_id = v_uid
  for update;

  if not found then
    raise exception 'Produit introuvable.';
  end if;

  if not v_product.is_active then
    raise exception 'Ce produit est archivé et ne peut plus être modifié.';
  end if;

  if v_product.quantity < v_quantity then
    raise exception 'Stock insuffisant : disponible %, demandé %.',
      v_product.quantity, v_quantity;
  end if;

  insert into public.stock_movements (
    user_id, product_id, type, quantity,
    quantity_before, quantity_after,
    reason, comment, product_reference, product_name, created_by
  ) values (
    v_uid, p_product_id, 'exit', v_quantity,
    v_product.quantity, v_product.quantity - v_quantity,
    trim(p_reason),
    nullif(trim(coalesce(p_comment, '')), ''),
    v_product.reference, v_product.name, v_uid
  )
  returning * into v_movement;

  perform set_config('app.allow_quantity_change', 'true', true);

  update public.products
  set quantity = quantity - v_quantity
  where id = p_product_id;

  return v_movement;
end;
$$;

-- ---------------------------------------------------------------------
-- Ajustement (correction traçable, delta signé)
--   p_delta > 0 => augmente le stock
--   p_delta < 0 => diminue le stock (jamais en dessous de 0)
-- ---------------------------------------------------------------------
create or replace function public.record_stock_adjustment(
  p_product_id uuid,
  p_delta       numeric,
  p_reason      text,
  p_comment     text default null
)
returns public.stock_movements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid        uuid := auth.uid();
  v_product    public.products%rowtype;
  v_movement   public.stock_movements%rowtype;
  v_delta      numeric;
  v_new_qty    numeric;
  v_quantity   numeric;
begin
  if v_uid is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;

  v_delta := round(coalesce(p_delta, 0)::numeric, 3);

  if v_delta is null or v_delta = 0 then
    raise exception 'L''ajustement doit être non nul.';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Le motif est obligatoire.';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id and user_id = v_uid
  for update;

  if not found then
    raise exception 'Produit introuvable.';
  end if;

  if not v_product.is_active then
    raise exception 'Ce produit est archivé et ne peut plus être modifié.';
  end if;

  v_new_qty := v_product.quantity + v_delta;

  if v_new_qty < 0 then
    raise exception 'Stock insuffisant : disponible %, ajustement %.',
      v_product.quantity, v_delta;
  end if;

  -- le sens de l'ajustement est porté par quantity_before / quantity_after
  v_quantity := abs(v_delta);

  insert into public.stock_movements (
    user_id, product_id, type, quantity,
    quantity_before, quantity_after,
    reason, comment, product_reference, product_name, created_by
  ) values (
    v_uid, p_product_id, 'adjustment', v_quantity,
    v_product.quantity, v_new_qty,
    trim(p_reason),
    nullif(trim(coalesce(p_comment, '')), ''),
    v_product.reference, v_product.name, v_uid
  )
  returning * into v_movement;

  perform set_config('app.allow_quantity_change', 'true', true);

  update public.products
  set quantity = v_new_qty
  where id = p_product_id;

  return v_movement;
end;
$$;

-- ---------------------------------------------------------------------
-- Droits d'exécution : aucune exécution anonyme, réservé aux utilisateurs
-- authentifiés. Les fonctions sont SECURITY DEFINER et revérifient elles-
-- mêmes l'appartenance du produit.
-- ---------------------------------------------------------------------
revoke all on function public.record_stock_entry(uuid, numeric, text, text) from public, anon;
revoke all on function public.record_stock_exit(uuid, numeric, text, text) from public, anon;
revoke all on function public.record_stock_adjustment(uuid, numeric, text, text) from public, anon;

grant execute on function public.record_stock_entry(uuid, numeric, text, text)     to authenticated;
grant execute on function public.record_stock_exit(uuid, numeric, text, text)      to authenticated;
grant execute on function public.record_stock_adjustment(uuid, numeric, text, text) to authenticated;
