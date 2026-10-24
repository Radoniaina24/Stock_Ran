-- =====================================================================
-- Migration 0002 : politiques Row Level Security (RLS)
-- Chaque utilisateur ne voit et ne modifie que ses propres données.
-- Les mouvements ne sont insérés que par les fonctions SECURITY DEFINER
-- (voir 0003) : aucune politique INSERT/UPDATE/DELETE côté client.
-- =====================================================================

-- ---------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------
drop policy if exists "products_select_own" on public.products;
create policy "products_select_own"
  on public.products for select
  using (auth.uid() = user_id);

drop policy if exists "products_insert_own" on public.products;
create policy "products_insert_own"
  on public.products for insert
  with check (auth.uid() = user_id);

drop policy if exists "products_update_own" on public.products;
create policy "products_update_own"
  on public.products for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Suppression autorisée uniquement si le produit n'a aucun mouvement.
-- (les produits avec historique doivent être archivés, pas supprimés)
drop policy if exists "products_delete_own" on public.products;
create policy "products_delete_own"
  on public.products for delete
  using (
    auth.uid() = user_id
    and not exists (
      select 1 from public.stock_movements sm where sm.product_id = products.id
    )
  );

-- ---------------------------------------------------------------------
-- stock_movements : lecture seule pour le client
-- ---------------------------------------------------------------------
drop policy if exists "movements_select_own" on public.stock_movements;
create policy "movements_select_own"
  on public.stock_movements for select
  using (auth.uid() = user_id);

-- Pas de politique INSERT / UPDATE / DELETE : les écritures passent
-- exclusivement par record_stock_entry / record_stock_exit /
-- record_stock_adjustment (SECURITY DEFINER, verrou de ligne inclus).
