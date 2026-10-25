-- =====================================================================
-- Migration 0006 : vues de lecture et fonctions transactionnelles des ventes
--
-- Prérequis : 0001 -> 0002 -> 0003 -> 0004 -> 0005
--
-- Toutes les écritures sur sales / sale_items / payments passent par ces
-- fonctions SECURITY DEFINER : totaux recalculés et stock vérifié côté
-- PostgreSQL, dans une transaction atomique.
--
-- Ordre de verrouillage imposé partout (limitation des deadlocks) :
--   vente -> produits (toujours triés par id croissant)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Vue : balances des ventes (montant payé et solde restant dû)
-- security_invoker => les politiques RLS de l'utilisateur s'appliquent.
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
  p.last_payment_at
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

comment on view public.sale_balances is
  'Ventes avec montant encaissé, solde restant dû et statut de paiement recalculés.';

grant select on public.sale_balances to authenticated;


-- ---------------------------------------------------------------------
-- Vue : balances des clients (totaux agrégés, une ligne par client)
-- ---------------------------------------------------------------------
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
                         and sb.balance_due > 0)                      as open_sales_count
from public.clients c
left join public.sale_balances sb on sb.client_id = c.id
group by c.id, c.user_id, c.code, c.name, c.phone, c.email, c.address,
         c.is_active, c.created_at, c.updated_at;

comment on view public.client_balances is
  'Total des ventes, total payé et solde restant dû agrégés par client.';

grant select on public.client_balances to authenticated;


-- ---------------------------------------------------------------------
-- Recalcul du statut de paiement d une vente
-- (appelé par le trigger paiement et par les fonctions métier)
-- ---------------------------------------------------------------------
create or replace function public.refresh_sale_payment_status(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_paid       numeric;
  v_new_status text;
begin
  if p_sale_id is null then
    return;
  end if;

  select coalesce(sum(amount), 0) into v_paid
  from public.payments
  where sale_id = p_sale_id and status = 'validated';

  if v_paid is null then
    v_paid := 0;
  end if;

  select case
    when s.status = 'cancelled'                   then 'cancelled'
    when s.total_amount <= 0                      then 'paid'
    when v_paid <= 0                              then 'unpaid'
    when v_paid >= s.total_amount                 then 'paid'
    else 'partial'
  end
  into v_new_status
  from public.sales s
  where s.id = p_sale_id;

  if v_new_status is null then
    return;
  end if;

  update public.sales
  set payment_status = v_new_status
  where id = p_sale_id
    and payment_status is distinct from v_new_status;
end;
$$;

revoke all on function public.refresh_sale_payment_status(uuid) from public, anon;
grant execute on function public.refresh_sale_payment_status(uuid) to authenticated;

-- Le statut de paiement suit toujours les paiements validés / annulés.
create or replace function public.payments_touch_sale_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.refresh_sale_payment_status(coalesce(new.sale_id, old.sale_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists payments_refresh_sale_status on public.payments;
create trigger payments_refresh_sale_status
  after insert or update or delete on public.payments
  for each row
  execute function public.payments_touch_sale_status();


-- ---------------------------------------------------------------------
-- Enregistrement d une vente (atomique)
--
-- p_items : [{"product_id": "uuid", "quantity": 2, "unit_price": 1500}]
--           unit_price facultatif => prix de vente courant du produit.
-- ---------------------------------------------------------------------
create or replace function public.create_sale(
  p_client_id             uuid,
  p_sale_date             date,
  p_items                 jsonb,
  p_comment               text default null,
  p_discount_amount       numeric default 0,
  p_payment_amount        numeric default 0,
  p_payment_method        text default 'cash',
  p_transaction_reference text default null,
  p_payment_comment       text default null
)
returns public.sales
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid         uuid := auth.uid();
  v_client      public.clients%rowtype;
  v_product     public.products%rowtype;
  v_sale        public.sales%rowtype;
  v_item        jsonb;
  v_raw_pid     text;
  v_pid         uuid;
  v_qty         numeric;
  v_price       numeric;
  v_idx         int;
  v_line_count  int := 0;
  v_found       int := 0;
  v_product_ids uuid[] := array[]::uuid[];
  v_quantities  numeric[] := array[]::numeric[];
  v_prices      numeric[] := array[]::numeric[];
  v_subtotal    numeric := 0;
  v_discount    numeric;
  v_total       numeric;
  v_amount      numeric;
  v_sale_date   date;
  v_reference   text;
  v_sale_id     uuid;
  v_payment_ref text;
  i             int;
begin
  if v_uid is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;

  if p_client_id is null then
    raise exception 'Le client est obligatoire.';
  end if;

  select * into v_client
  from public.clients
  where id = p_client_id and user_id = v_uid;

  if not found then
    raise exception 'Client introuvable.';
  end if;

  if not v_client.is_active then
    raise exception 'Le client « % » est archivé et ne peut pas être utilisé.', v_client.name;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La vente doit contenir au moins un produit.';
  end if;

  -- 1. Lecture et validation des lignes, fusion des doublons de produit.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_raw_pid := nullif(trim(coalesce(v_item ->> 'product_id', '')), '');

    if v_raw_pid is null
       or v_raw_pid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Chaque ligne de vente doit référencer un produit valide.';
    end if;
    v_pid := v_raw_pid::uuid;

    begin
      v_qty := round((v_item ->> 'quantity')::numeric, 3);
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'Quantité invalide pour un produit de la vente.';
    end;

    if v_qty is null or v_qty <= 0 then
      raise exception 'La quantité doit être strictement supérieure à zéro.';
    end if;

    if v_item ->> 'unit_price' is null or trim(v_item ->> 'unit_price') = '' then
      v_price := null;
    else
      begin
        v_price := round((v_item ->> 'unit_price')::numeric, 2);
      exception
        when invalid_text_representation or numeric_value_out_of_range then
          raise exception 'Prix de vente invalide pour un produit de la vente.';
      end;

      if v_price is null or v_price < 0 then
        raise exception 'Le prix de vente doit être supérieur ou égal à zéro.';
      end if;
    end if;

    v_idx := array_position(v_product_ids, v_pid);
    if v_idx is null then
      v_product_ids := array_append(v_product_ids, v_pid);
      v_quantities  := array_append(v_quantities, v_qty);
      v_prices      := array_append(v_prices, v_price);
      v_line_count  := v_line_count + 1;
    else
      if v_prices[v_idx] is distinct from v_price then
        raise exception 'Le même produit ne peut pas apparaître deux fois avec des prix différents.';
      end if;
      v_quantities[v_idx] := v_quantities[v_idx] + v_qty;
    end if;
  end loop;

  if v_line_count = 0 then
    raise exception 'La vente doit contenir au moins un produit.';
  end if;

  -- 2. Verrouillage des produits dans un ordre constant (anti-deadlock).
  for v_product in
    select * from public.products
    where id = any (v_product_ids) and user_id = v_uid
    order by id
    for update
  loop
    v_found := v_found + 1;
    v_idx := array_position(v_product_ids, v_product.id);

    if v_idx is null then
      raise exception 'Ligne de vente incohérente pour le produit « % ».', v_product.name;
    end if;

    if not v_product.is_active then
      raise exception 'Le produit « % » est archivé et ne peut pas être vendu.', v_product.name;
    end if;

    if v_prices[v_idx] is null then
      v_prices[v_idx] := v_product.sale_price;
    end if;

    if v_product.quantity < v_quantities[v_idx] then
      raise exception 'Stock insuffisant pour « % » : disponible %, demandé %.',
        v_product.name, v_product.quantity, v_quantities[v_idx];
    end if;

    v_subtotal := v_subtotal + round(v_quantities[v_idx] * v_prices[v_idx], 2);
  end loop;

  if v_found <> v_line_count then
    raise exception 'Un ou plusieurs produits de la vente sont introuvables.';
  end if;

  -- 3. Montants.
  begin
    v_discount := round(coalesce(p_discount_amount, 0), 2);
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Montant de remise invalide.';
  end;

  if v_discount is null or v_discount < 0 then
    raise exception 'La remise ne peut pas être négative.';
  end if;
  if v_discount > v_subtotal then
    raise exception 'La remise ne peut pas dépasser le montant brut de la vente.';
  end if;

  v_total      := v_subtotal - v_discount;
  v_sale_date  := coalesce(p_sale_date, current_date);
  v_reference  := 'VTE-' || lpad(public.next_reference_value('sale')::text, 4, '0');

  -- 4. Vente + lignes + déduction du stock + mouvements de sortie.
  insert into public.sales (
    user_id, reference, client_id, sale_date,
    subtotal, discount_amount, total_amount,
    payment_status, status, comment
  ) values (
    v_uid, v_reference, p_client_id, v_sale_date,
    v_subtotal, v_discount, v_total,
    'unpaid', 'validated', nullif(trim(coalesce(p_comment, '')), '')
  )
  returning id into v_sale_id;

  perform set_config('app.allow_quantity_change', 'true', true);

  for i in 1 .. v_line_count loop
    v_pid := v_product_ids[i];

    select * into v_product
    from public.products
    where id = v_pid and user_id = v_uid;

    insert into public.sale_items (
      sale_id, product_id, product_reference_snapshot, product_name_snapshot,
      quantity, unit_price, line_total
    ) values (
      v_sale_id, v_pid, v_product.reference, v_product.name,
      v_quantities[i], v_prices[i], round(v_quantities[i] * v_prices[i], 2)
    );

    insert into public.stock_movements (
      user_id, product_id, type, quantity,
      quantity_before, quantity_after,
      reason, comment, product_reference, product_name, created_by
    ) values (
      v_uid, v_pid, 'exit', v_quantities[i],
      v_product.quantity, v_product.quantity - v_quantities[i],
      'vente', v_reference, v_product.reference, v_product.name, v_uid
    );

    update public.products
    set quantity = quantity - v_quantities[i]
    where id = v_pid;
  end loop;

  -- 5. Éventuel premier paiement.
  begin
    v_amount := round(coalesce(p_payment_amount, 0), 2);
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Montant de paiement invalide.';
  end;

  if v_amount is not null and v_amount > 0 then
    if v_amount > v_total then
      raise exception 'Le paiement initial dépasse le montant total de la vente.';
    end if;
    if p_payment_method is null
       or p_payment_method not in ('cash', 'mobile_money', 'bank_transfer', 'check', 'other') then
      raise exception 'Mode de paiement invalide.';
    end if;

    v_payment_ref := 'PAY-' || lpad(public.next_reference_value('payment')::text, 4, '0');

    insert into public.payments (
      user_id, reference, sale_id, client_id, amount,
      payment_method, transaction_reference, status, paid_at, comment
    ) values (
      v_uid, v_payment_ref, v_sale_id, p_client_id, v_amount,
      p_payment_method,
      nullif(trim(coalesce(p_transaction_reference, '')), ''),
      'validated',
      now(),
      nullif(trim(coalesce(p_payment_comment, '')), '')
    );
  end if;

  perform public.refresh_sale_payment_status(v_sale_id);

  select * into v_sale from public.sales where id = v_sale_id;
  return v_sale;
end;
$$;

revoke all on function public.create_sale(uuid, date, jsonb, text, numeric, numeric, text, text, text) from public, anon;
grant execute on function public.create_sale(uuid, date, jsonb, text, numeric, numeric, text, text, text) to authenticated;


-- ---------------------------------------------------------------------
-- Enregistrement d un paiement (atomique, plafonné par le solde dû)
-- ---------------------------------------------------------------------
create or replace function public.record_payment(
  p_sale_id              uuid,
  p_amount               numeric,
  p_payment_method       text,
  p_transaction_reference text default null,
  p_comment              text default null,
  p_paid_at              timestamptz default null
)
returns public.payments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := auth.uid();
  v_sale      public.sales%rowtype;
  v_paid      numeric;
  v_balance   numeric;
  v_amount    numeric;
  v_reference text;
  v_payment   public.payments%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;

  begin
    v_amount := round(coalesce(p_amount, 0), 2);
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Montant de paiement invalide.';
  end;

  if v_amount is null or v_amount <= 0 then
    raise exception 'Le montant du paiement doit être strictement supérieur à zéro.';
  end if;

  if p_payment_method is null
     or p_payment_method not in ('cash', 'mobile_money', 'bank_transfer', 'check', 'other') then
    raise exception 'Mode de paiement invalide.';
  end if;

  if p_sale_id is null then
    raise exception 'La vente est obligatoire.';
  end if;

  -- Verrou de ligne : deux paiements simultanés sur la même vente sont sérialisés.
  select * into v_sale
  from public.sales
  where id = p_sale_id and user_id = v_uid
  for update;

  if not found then
    raise exception 'Vente introuvable.';
  end if;

  if v_sale.status = 'cancelled' then
    raise exception 'Impossible d''enregistrer un paiement sur une vente annulée.';
  end if;

  select coalesce(sum(amount), 0) into v_paid
  from public.payments
  where sale_id = v_sale.id and status = 'validated';

  v_balance := greatest(v_sale.total_amount - coalesce(v_paid, 0), 0);

  if v_amount > v_balance then
    raise exception 'Le montant dépasse le solde restant dû (% Ar).', v_balance;
  end if;

  v_reference := 'PAY-' || lpad(public.next_reference_value('payment')::text, 4, '0');

  insert into public.payments (
    user_id, reference, sale_id, client_id, amount,
    payment_method, transaction_reference, status, paid_at, comment
  ) values (
    v_uid, v_reference, v_sale.id, v_sale.client_id, v_amount,
    p_payment_method,
    nullif(trim(coalesce(p_transaction_reference, '')), ''),
    'validated',
    coalesce(p_paid_at, now()),
    nullif(trim(coalesce(p_comment, '')), '')
  )
  returning * into v_payment;

  perform public.refresh_sale_payment_status(v_sale.id);

  return v_payment;
end;
$$;

revoke all on function public.record_payment(uuid, numeric, text, text, text, timestamptz) from public, anon;
grant execute on function public.record_payment(uuid, numeric, text, text, text, timestamptz) to authenticated;


-- ---------------------------------------------------------------------
-- Annulation tracée d un paiement (jamais de suppression)
-- ---------------------------------------------------------------------
create or replace function public.cancel_payment(
  p_payment_id uuid,
  p_comment    text default null
)
returns public.payments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_payment public.payments%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;

  if p_payment_id is null then
    raise exception 'Paiement introuvable.';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id and user_id = v_uid
  for update;

  if not found then
    raise exception 'Paiement introuvable.';
  end if;

  if v_payment.status = 'cancelled' then
    raise exception 'Ce paiement est déjà annulé.';
  end if;

  update public.payments
  set status = 'cancelled',
      cancelled_at = now(),
      cancel_comment = coalesce(nullif(trim(coalesce(p_comment, '')), ''), cancel_comment)
  where id = v_payment.id
  returning * into v_payment;

  perform public.refresh_sale_payment_status(v_payment.sale_id);

  return v_payment;
end;
$$;

revoke all on function public.cancel_payment(uuid, text) from public, anon;
grant execute on function public.cancel_payment(uuid, text) to authenticated;


-- ---------------------------------------------------------------------
-- Annulation d une vente : réintégration atomique du stock
-- Les paiements validés sont conservés (traçabilité), la vente sort des
-- créances et le statut devient « cancelled ».
-- ---------------------------------------------------------------------
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
  v_uid     uuid := auth.uid();
  v_sale    public.sales%rowtype;
  v_item    public.sale_items%rowtype;
  v_product public.products%rowtype;
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
    null; -- verrou acquis uniquement
  end loop;

  -- 2. Réintègre les quantités vendues avec des mouvements d'entrée tracés.
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

  -- 3. Annulation de la vente (les paiements restent en base).
  update public.sales
  set status = 'cancelled',
      payment_status = 'cancelled',
      cancelled_at = now(),
      cancel_comment = nullif(trim(coalesce(p_comment, '')), '')
  where id = v_sale.id
  returning * into v_sale;

  return v_sale;
end;
$$;

revoke all on function public.cancel_sale(uuid, text) from public, anon;
grant execute on function public.cancel_sale(uuid, text) to authenticated;


-- ---------------------------------------------------------------------
-- Synthèse du tableau de bord (lecture seule, RLS applicable)
-- ---------------------------------------------------------------------
create or replace function public.sales_overview()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'total_sales', coalesce((
      select sum(total_amount) from public.sale_balances where status <> 'cancelled'), 0),
    'total_paid', coalesce((
      select sum(paid_amount) from public.sale_balances where status <> 'cancelled'), 0),
    'total_receivables', coalesce((
      select sum(balance_due) from public.sale_balances where status <> 'cancelled'), 0),
    'unpaid_count', coalesce((
      select count(*) from public.sale_balances
      where status <> 'cancelled' and payment_status = 'unpaid'), 0),
    'partial_count', coalesce((
      select count(*) from public.sale_balances
      where status <> 'cancelled' and payment_status = 'partial'), 0),
    'paid_count', coalesce((
      select count(*) from public.sale_balances
      where status <> 'cancelled' and payment_status = 'paid'), 0),
    'sales_count', coalesce((
      select count(*) from public.sale_balances where status <> 'cancelled'), 0),
    'receivables_count', coalesce((
      select count(*) from public.sale_balances
      where status <> 'cancelled' and balance_due > 0), 0),
    'latest_sales', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', sb.id,
          'reference', sb.reference,
          'client_name', sb.client_name,
          'sale_date', sb.sale_date,
          'total_amount', sb.total_amount,
          'paid_amount', sb.paid_amount,
          'balance_due', sb.balance_due,
          'payment_status', sb.payment_status,
          'created_at', sb.created_at
        )
        order by sb.created_at desc
      )
      from (
        select * from public.sale_balances
        where status <> 'cancelled'
        order by created_at desc
        limit 5
      ) sb
    ), '[]'::jsonb),
    'latest_payments', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'reference', p.reference,
          'amount', p.amount,
          'payment_method', p.payment_method,
          'paid_at', p.paid_at,
          'client_name', c.name,
          'sale_reference', s.reference
        )
        order by p.paid_at desc
      )
      from (
        select * from public.payments
        where status = 'validated'
        order by paid_at desc
        limit 5
      ) p
      join public.sales s on s.id = p.sale_id and s.status <> 'cancelled'
      join public.clients c on c.id = p.client_id
    ), '[]'::jsonb),
    'top_products', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'name', t.name,
          'reference', t.reference,
          'quantity', t.quantity,
          'amount', t.amount
        )
        order by t.quantity desc, t.amount desc
      )
      from (
        select
          si.product_name_snapshot  as name,
          si.product_reference_snapshot as reference,
          sum(si.quantity)   as quantity,
          sum(si.line_total) as amount
        from public.sale_items si
        join public.sales s on s.id = si.sale_id
        where s.status <> 'cancelled'
        group by si.product_name_snapshot, si.product_reference_snapshot
        order by sum(si.quantity) desc, sum(si.line_total) desc
        limit 5
      ) t
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.sales_overview() from public, anon;
grant execute on function public.sales_overview() to authenticated;


-- Rafraîchir le cache de schéma PostgREST (vues + fonctions nouvelles).
notify pgrst, 'reload schema';
