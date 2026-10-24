-- =====================================================================
-- Migration 0004 : diffusion Realtime des produits et des mouvements
-- Permet au client de se resynchroniser automatiquement (autres onglets,
-- autres appareils). Les politiques RLS s'appliquent aux événements.
-- =====================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'products'
  ) then
    alter publication supabase_realtime add table public.products;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stock_movements'
  ) then
    alter publication supabase_realtime add table public.stock_movements;
  end if;
end;
$$;
