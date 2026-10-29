-- =====================================================================
-- 0011 : l'annulation d'une vente rembourse ses paiements
-- ---------------------------------------------------------------------
-- Avant : cancel_sale annulait la vente et réintégrait le stock mais
-- laissait les paiements « validated ». Les vues et sales_overview
-- excluant les ventes annulées, l'encaissement disparaissait des totaux
-- tout en restant compté comme validé.
--
-- Désormais, dans la même transaction, tous les paiements non annulés
-- de la vente passent à « cancelled » avec un commentaire explicite
-- « Remboursé – annulation VTE-xxxx[ : motif saisi] ».
--
-- Définition EFFECTIVE reprise après 0007-0010 :
--   * 0007 : auth.uid() remplacé par public.current_workspace_id()
--            (espace partagé : user_id = propriétaire de l'espace) ;
--   * 0009 : created_by / cancelled_by posés par les triggers
--            set_action_author / set_movement_author (auth.uid() réel) ;
--   * 0010 : trigger sales_guard_closed_day : la mise à jour du statut
--            de la vente est faite AVANT le remboursement des paiements,
--            si la journée est clôturée l'exception du garde annule tout
--            (aucun remboursement possible sur un jour clôturé).
-- Signature et type de retour inchangés (public.sales) : le montant
-- remboursé se lit via public.sale_refunded_amount(sale_id) ou sur les
-- paiements annulés de la vente.
-- =====================================================================

create or replace function public.cancel_sale(
  p_sale_id uuid,
  p_comment text default null
)
returns public.sales
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := public.current_workspace_id();
  v_sale    public.sales%rowtype;
  v_item    public.sale_items%rowtype;
  v_product public.products%rowtype;
  v_payment public.payments%rowtype;
  v_comment text := nullif(trim(coalesce(p_comment, '')), '');
  v_refund_comment text;
begin
  if v_uid is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;

  if p_sale_id is null then
    raise exception 'Vente introuvable.';
  end if;

  select * into v_sale
  from public.sales
  where id = p_sale_id and user_id = v_uid
  for update;

  if not found then
    raise exception 'Vente introuvable.';
  end if;

  if v_sale.status = 'cancelled' then
    raise exception 'Cette vente est déjà annulée.';
  end if;

  -- 1. Verrouille les produits dans l'ordre croissant des identifiants.
  for v_product in
    select p.* from public.products p
    join public.sale_items si on si.product_id = p.id
    where si.sale_id = v_sale.id and p.user_id = v_uid
    order by p.id
    for update of p
  loop
    null;
  end loop;

  -- 2. Verrouille les paiements non annulés de la vente (ordre id).
  for v_payment in
    select * from public.payments
    where sale_id = v_sale.id and user_id = v_uid and status <> 'cancelled'
    order by id
    for update
  loop
    null;
  end loop;

  -- 3. Annulation de la vente en premier : le garde de clôture (0010)
  --    refuse ici toute annulation / remboursement sur un jour clôturé.
  update public.sales
  set status = 'cancelled',
      payment_status = 'cancelled',
      cancelled_at = now(),
      cancel_comment = v_comment
  where id = v_sale.id
  returning * into v_sale;

  -- 4. Réintègre les quantités vendues avec des mouvements d'entrée tracés.
  perform set_config('app.allow_quantity_change', 'true', true);

  for v_item in
    select * from public.sale_items
    where sale_id = v_sale.id
    order by product_id
  loop
    select * into v_product
    from public.products
    where id = v_item.product_id and user_id = v_uid;

    if found then
      insert into public.stock_movements (
        user_id, product_id, type, quantity,
        quantity_before, quantity_after,
        reason, comment, product_reference, product_name, created_by
      ) values (
        v_uid, v_item.product_id, 'entry', v_item.quantity,
        v_product.quantity, v_product.quantity + v_item.quantity,
        'annulation de vente',
        'Annulation ' || v_sale.reference,
        v_item.product_reference_snapshot, v_item.product_name_snapshot, v_uid
      );

      update public.products
      set quantity = quantity + v_item.quantity
      where id = v_item.product_id;
    end if;
  end loop;

  -- 5. Remboursement : annule les paiements non annulés (trace conservée,
  --    cancelled_by posé par le trigger d'auteur).
  v_refund_comment := 'Remboursé – annulation ' || v_sale.reference
                      || coalesce(' : ' || v_comment, '');

  update public.payments
  set status = 'cancelled',
      cancelled_at = now(),
      cancel_comment = v_refund_comment
  where sale_id = v_sale.id
    and user_id = v_uid
    and status <> 'cancelled';

  -- Le trigger paiement a pu recalculer payment_status : relit la vente.
  select * into v_sale from public.sales where id = v_sale.id;

  return v_sale;
end;
$$;

revoke all on function public.cancel_sale(uuid, text) from public, anon;
grant execute on function public.cancel_sale(uuid, text) to authenticated;


-- Montant remboursé lors de l'annulation d'une vente (lecture, RLS via
-- le filtre espace de travail).
create or replace function public.sale_refunded_amount(p_sale_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(p.amount), 0)::numeric
  from public.payments p
  join public.sales s on s.id = p.sale_id
  where p.sale_id = p_sale_id
    and p.user_id = public.current_workspace_id()
    and s.status = 'cancelled'
    and p.status = 'cancelled'
    and p.cancel_comment like 'Remboursé – annulation %';
$$;

revoke all on function public.sale_refunded_amount(uuid) from public, anon;
grant execute on function public.sale_refunded_amount(uuid) to authenticated;
