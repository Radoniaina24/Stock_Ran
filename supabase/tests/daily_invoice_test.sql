-- =====================================================================
-- Tests de la facture journalière récapitulative et de la clôture
--
-- Prérequis : migrations 0001 -> 0010 exécutées.
-- À exécuter dans le SQL Editor de Supabase (ou via
-- `supabase db query --linked -f supabase/tests/daily_invoice_test.sql`).
--
-- Le script complet est ANNULÉ à la fin (ROLLBACK) : aucune donnée de
-- test n'est conservée. En cas d'échec, une exception « ÉCHEC » indique
-- le scénario fautif.
--
-- Couverture :
--   #1  journée avec un seul client et une seule vente
--   #2  journée avec plusieurs clients et plusieurs produits
--   #3  client ayant plusieurs ventes le même jour (références conservées)
--   #4  vente partiellement payée
--   #5  vente totalement impayée
--   #6  vente entièrement payée
--   #7  journée sans aucune vente
--   #8  vente annulée exclue des ventes valides
--   #9  prix historique conservé après changement du prix du produit
--   #11 lectures répétées : même numéro, aucune écriture (ni vente,
--       ni paiement, ni mouvement de stock, ni facture)
--   #12 ventes de deux comptes du même espace regroupées dans la même
--       facture (le verrou de journée est décrit dans le README)
--   C1  clôture : instantané figé et totaux arrêtés
--   C2  journée clôturée : nouvelle vente et annulation refusées
--   C3  paiement après clôture : instantané inchangé, état actuel à jour
--   C4  double clôture refusée, une seule facture par date
--   C5  réouverture réservée au propriétaire, motif obligatoire, tracée
--   C6  nouvelle clôture après correction : révision 2
--   C7  clôture d'une journée vide ou future refusée
--   R1  isolation RLS entre deux espaces
--
-- Le scénario #10 (impression 58 mm / 80 mm) est couvert par les tests
-- du composant DailyInvoice (Vitest) et la procédure du README.
-- =====================================================================

begin;

do $$
declare
  v_owner   uuid := '44444444-4444-4444-8444-444444444444';
  v_member  uuid := '55555555-5555-4555-8555-555555555555';
  v_other   uuid := '66666666-6666-4666-8666-666666666666';
  d1        date := date '2026-01-12';
  d2        date := date '2026-01-13';
  d3        date := date '2026-01-14';
  v_riz     uuid;
  v_huile   uuid;
  v_savon   uuid;
  v_rasoa   uuid;
  v_rakoto  uuid;
  v_fanilo  uuid;
  v_s1      public.sales%rowtype;
  v_s2      public.sales%rowtype;
  v_s3      public.sales%rowtype;
  v_s4      public.sales%rowtype;
  v_s5      public.sales%rowtype;
  v_s6      public.sales%rowtype;
  v_inv     jsonb;
  v_inv2    jsonb;
  v_totals  jsonb;
  v_sale    jsonb;
  v_row     public.daily_invoices%rowtype;
  v_counts  text;
  v_counts2 text;
  v_raised  boolean;
  v_msg     text;
  v_count   integer;
begin
  -- ------------------------------------------------------------------
  -- Comptes : propriétaire + membre du même espace, et un espace tiers
  -- ------------------------------------------------------------------
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values
    ('00000000-0000-0000-0000-000000000000', v_owner, 'authenticated', 'authenticated',
      'facture-owner@example.com', crypt('password', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', v_member, 'authenticated', 'authenticated',
      'facture-member@example.com', crypt('password', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', v_other, 'authenticated', 'authenticated',
      'facture-other@example.com', crypt('password', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now());

  -- Rattachements indépendants des comptes déjà présents dans la base.
  delete from public.workspace_members where user_id in (v_owner, v_member, v_other);
  insert into public.workspace_members (user_id, owner_id) values (v_member, v_owner);

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  insert into public.products (user_id, reference, name, unit, quantity, low_stock_threshold, sale_price)
  values (v_owner, 'RIZ-01', 'Riz blanc Makalioka', 'kg', 100, 10, 3200) returning id into v_riz;
  insert into public.products (user_id, reference, name, unit, quantity, low_stock_threshold, sale_price)
  values (v_owner, 'HUI-01', 'Huile Tiko 1 L', 'litre', 50, 5, 9500) returning id into v_huile;
  insert into public.products (user_id, reference, name, unit, quantity, low_stock_threshold, sale_price)
  values (v_owner, 'SAV-01', 'Savon Nosy 400 g', 'pièce', 30, 5, 2500) returning id into v_savon;

  insert into public.clients (user_id, name) values (v_owner, 'Épicerie Rasoa') returning id into v_rasoa;
  insert into public.clients (user_id, name) values (v_owner, 'Quincaillerie Rakoto') returning id into v_rakoto;
  insert into public.clients (user_id, name) values (v_owner, 'École Fanilo') returning id into v_fanilo;

  -- ------------------------------------------------------------------
  -- #1 Un seul client, une seule vente (J1) : 2 kg de riz, payée
  -- ------------------------------------------------------------------
  v_s1 := public.create_sale(v_rasoa, d1,
    jsonb_build_array(jsonb_build_object('product_id', v_riz, 'quantity', 2, 'unit_price', 3200)),
    null, 0, 6400, 'cash');

  v_inv := public.daily_invoice(d1);
  v_totals := v_inv -> 'totals';
  if v_inv ->> 'invoice_number' <> 'FACT-20260112'
     or (v_totals ->> 'clients_count')::int <> 1
     or (v_totals ->> 'sales_count')::int <> 1
     or (v_totals ->> 'items_quantity')::numeric <> 2
     or (v_totals ->> 'net_amount')::numeric <> 6400
     or (v_totals ->> 'paid_amount')::numeric <> 6400
     or (v_totals ->> 'balance_due')::numeric <> 0
     or jsonb_array_length(v_inv -> 'sales' -> 0 -> 'items') <> 1 then
    raise exception 'ÉCHEC (#1) : facture d''une seule vente incorrecte : %', v_inv;
  end if;

  -- ------------------------------------------------------------------
  -- #2..#6, #8 Journée J2 avec plusieurs clients et produits
  --   S2 Rasoa   : 10 kg riz + 4 huiles, remise 2 000, acompte 20 000 (partielle)
  --   S3 Rasoa   : 3 savons, aucun paiement (impayée) -> même client
  --   S4 Rakoto  : 5 huiles, payée intégralement en deux fois
  --   S5 Fanilo  : 2 savons, annulée (exclue)
  -- ------------------------------------------------------------------
  v_s2 := public.create_sale(v_rasoa, d2,
    jsonb_build_array(
      jsonb_build_object('product_id', v_riz, 'quantity', 10, 'unit_price', 3200),
      jsonb_build_object('product_id', v_huile, 'quantity', 4, 'unit_price', 9500)),
    null, 2000, 20000, 'cash');
  -- brut 32 000 + 38 000 = 70 000 ; net 68 000 ; payé 20 000 ; reste 48 000

  v_s3 := public.create_sale(v_rasoa, d2,
    jsonb_build_array(jsonb_build_object('product_id', v_savon, 'quantity', 3, 'unit_price', 2500)),
    null, 0, 0, 'cash');
  -- 7 500 impayée

  -- #12 Vente saisie par un autre compte du même espace.
  perform set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_member::text, true);

  v_s4 := public.create_sale(v_rakoto, d2,
    jsonb_build_array(jsonb_build_object('product_id', v_huile, 'quantity', 5, 'unit_price', 9500)),
    null, 0, 20000, 'mobile_money');
  perform public.record_payment(v_s4.id, 27500, 'cash');
  -- 47 500 payée en deux paiements

  v_s5 := public.create_sale(v_fanilo, d2,
    jsonb_build_array(jsonb_build_object('product_id', v_savon, 'quantity', 2, 'unit_price', 2500)),
    null, 0, 5000, 'cash');
  perform public.cancel_sale(v_s5.id, 'Erreur de saisie');

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_owner::text, true);

  -- #9 Le prix catalogue change après la vente.
  update public.products set sale_price = 4000 where id = v_riz;

  v_inv := public.daily_invoice(d2);
  v_totals := v_inv -> 'totals';

  if (v_totals ->> 'clients_count')::int <> 2
     or (v_totals ->> 'sales_count')::int <> 3
     or (v_totals ->> 'items_quantity')::numeric <> 22
     or (v_totals ->> 'gross_amount')::numeric <> 125000
     or (v_totals ->> 'discount_amount')::numeric <> 2000
     or (v_totals ->> 'net_amount')::numeric <> 123000
     or (v_totals ->> 'paid_amount')::numeric <> 67500
     or (v_totals ->> 'balance_due')::numeric <> 55500 then
    raise exception 'ÉCHEC (#2) : totaux de la journée incorrects : %', v_totals;
  end if;

  if (v_totals ->> 'net_amount')::numeric
     <> (v_totals ->> 'gross_amount')::numeric - (v_totals ->> 'discount_amount')::numeric
     or (v_totals ->> 'balance_due')::numeric
     <> (v_totals ->> 'net_amount')::numeric - (v_totals ->> 'paid_amount')::numeric then
    raise exception 'ÉCHEC (#2) : formules net / reste incohérentes : %', v_totals;
  end if;

  -- Somme des lignes = total brut, et chaque ligne = quantité × prix.
  select count(*) into v_count
  from jsonb_array_elements(v_inv -> 'sales') s,
       jsonb_array_elements(s -> 'items') i
  where (i ->> 'line_total')::numeric <> round((i ->> 'quantity')::numeric * (i ->> 'unit_price')::numeric, 2);
  if v_count <> 0 then
    raise exception 'ÉCHEC (#2) : % ligne(s) dont le total ne vaut pas quantité × prix.', v_count;
  end if;

  if (select sum((i ->> 'line_total')::numeric)
      from jsonb_array_elements(v_inv -> 'sales') s, jsonb_array_elements(s -> 'items') i) <> 125000 then
    raise exception 'ÉCHEC (#2) : la somme des lignes ne correspond pas au total brut.';
  end if;

  -- #3 Rasoa : deux ventes distinctes, références conservées.
  select count(*) into v_count from jsonb_array_elements(v_inv -> 'sales') s
  where (s ->> 'client_id')::uuid = v_rasoa;
  if v_count <> 2 then
    raise exception 'ÉCHEC (#3) : Rasoa devrait avoir 2 ventes dans la facture (%).', v_count;
  end if;
  if not exists (select 1 from jsonb_array_elements(v_inv -> 'sales') s where s ->> 'reference' = v_s2.reference)
     or not exists (select 1 from jsonb_array_elements(v_inv -> 'sales') s where s ->> 'reference' = v_s3.reference) then
    raise exception 'ÉCHEC (#3) : références de vente manquantes.';
  end if;

  -- #4 / #5 / #6 statuts et montants par vente.
  select s into v_sale from jsonb_array_elements(v_inv -> 'sales') s where (s ->> 'id')::uuid = v_s2.id;
  if v_sale ->> 'payment_status' <> 'partial' or (v_sale ->> 'paid_amount')::numeric <> 20000
     or (v_sale ->> 'balance_due')::numeric <> 48000 then
    raise exception 'ÉCHEC (#4) : vente partielle incorrecte : %', v_sale;
  end if;

  select s into v_sale from jsonb_array_elements(v_inv -> 'sales') s where (s ->> 'id')::uuid = v_s3.id;
  if v_sale ->> 'payment_status' <> 'unpaid' or (v_sale ->> 'paid_amount')::numeric <> 0
     or (v_sale ->> 'balance_due')::numeric <> 7500 then
    raise exception 'ÉCHEC (#5) : vente impayée incorrecte : %', v_sale;
  end if;

  select s into v_sale from jsonb_array_elements(v_inv -> 'sales') s where (s ->> 'id')::uuid = v_s4.id;
  if v_sale ->> 'payment_status' <> 'paid' or (v_sale ->> 'paid_amount')::numeric <> 47500
     or (v_sale ->> 'balance_due')::numeric <> 0 then
    raise exception 'ÉCHEC (#6) : vente payée incorrecte (paiements comptés une fois) : %', v_sale;
  end if;

  -- #8 Vente annulée exclue, mais signalée.
  if exists (select 1 from jsonb_array_elements(v_inv -> 'sales') s where (s ->> 'id')::uuid = v_s5.id)
     or (v_inv ->> 'cancelled_sales_count')::int <> 1 then
    raise exception 'ÉCHEC (#8) : la vente annulée ne doit pas figurer dans la facture.';
  end if;

  -- #9 Prix historique : 3 200 Ar même après passage du riz à 4 000 Ar.
  if not exists (
    select 1 from jsonb_array_elements(v_inv -> 'sales') s, jsonb_array_elements(s -> 'items') i
    where (i ->> 'product_id')::uuid = v_riz and (i ->> 'unit_price')::numeric = 3200
  ) or exists (
    select 1 from jsonb_array_elements(v_inv -> 'sales') s, jsonb_array_elements(s -> 'items') i
    where (i ->> 'unit_price')::numeric = 4000
  ) then
    raise exception 'ÉCHEC (#9) : le prix unitaire historique n''est pas conservé.';
  end if;

  -- ------------------------------------------------------------------
  -- #7 Journée sans vente
  -- ------------------------------------------------------------------
  v_inv := public.daily_invoice(d3);
  if jsonb_array_length(v_inv -> 'sales') <> 0
     or (v_inv -> 'totals' ->> 'sales_count')::int <> 0
     or (v_inv -> 'totals' ->> 'net_amount')::numeric <> 0
     or v_inv -> 'closing' <> 'null'::jsonb then
    raise exception 'ÉCHEC (#7) : journée vide incorrecte : %', v_inv;
  end if;

  -- ------------------------------------------------------------------
  -- #11 Lectures répétées : aucune écriture, numéro stable
  -- ------------------------------------------------------------------
  select concat_ws('|',
    (select count(*) from public.sales),
    (select count(*) from public.sale_items),
    (select count(*) from public.payments),
    (select count(*) from public.stock_movements),
    (select count(*) from public.daily_invoices),
    (select sum(quantity) from public.products where user_id = v_owner))
  into v_counts;

  v_inv  := public.daily_invoice(d2);
  v_inv2 := public.daily_invoice(d2);
  perform public.daily_invoice(d2);

  select concat_ws('|',
    (select count(*) from public.sales),
    (select count(*) from public.sale_items),
    (select count(*) from public.payments),
    (select count(*) from public.stock_movements),
    (select count(*) from public.daily_invoices),
    (select sum(quantity) from public.products where user_id = v_owner))
  into v_counts2;

  if v_counts <> v_counts2 then
    raise exception 'ÉCHEC (#11) : la lecture de la facture a modifié des données (% -> %).', v_counts, v_counts2;
  end if;
  if v_inv ->> 'invoice_number' <> v_inv2 ->> 'invoice_number'
     or v_inv -> 'totals' <> v_inv2 -> 'totals' then
    raise exception 'ÉCHEC (#11) : facture instable entre deux lectures.';
  end if;

  -- ------------------------------------------------------------------
  -- C1 Clôture de J2 par le membre de l'espace
  -- ------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_member::text, true);

  v_row := public.close_daily_invoice(d2, 'Caisse du soir');
  if v_row.status <> 'closed' or v_row.revision <> 1 or v_row.invoice_number <> 'FACT-20260113'
     or v_row.user_id <> v_owner or v_row.closed_by <> v_member
     or v_row.net_amount <> 123000 or v_row.paid_amount <> 67500 or v_row.balance_due <> 55500
     or v_row.sales_count <> 3 or v_row.clients_count <> 2 then
    raise exception 'ÉCHEC (C1) : clôture incorrecte (% / % / %).', v_row.status, v_row.net_amount, v_row.closed_by;
  end if;

  -- La clôture ne touche ni aux ventes, ni aux paiements, ni au stock.
  select concat_ws('|',
    (select count(*) from public.sales),
    (select count(*) from public.sale_items),
    (select count(*) from public.payments),
    (select count(*) from public.stock_movements),
    (select count(*) from public.daily_invoices) - 1,
    (select sum(quantity) from public.products where user_id = v_owner))
  into v_counts2;
  if v_counts <> v_counts2 then
    raise exception 'ÉCHEC (C1) : la clôture a modifié des données métier (% -> %).', v_counts, v_counts2;
  end if;

  -- ------------------------------------------------------------------
  -- C2 Journée clôturée : nouvelle vente et annulation refusées
  -- ------------------------------------------------------------------
  v_raised := false;
  begin
    perform public.create_sale(v_fanilo, d2,
      jsonb_build_array(jsonb_build_object('product_id', v_savon, 'quantity', 1, 'unit_price', 2500)));
  exception when others then
    v_raised := true;
    v_msg := sqlerrm;
  end;
  if not v_raised or v_msg not like '%clôturée%' then
    raise exception 'ÉCHEC (C2) : une vente a pu être ajoutée à une journée clôturée (%).', v_msg;
  end if;

  v_raised := false;
  begin
    perform public.cancel_sale(v_s3.id, 'Test');
  exception when others then
    v_raised := true;
    v_msg := sqlerrm;
  end;
  if not v_raised or v_msg not like '%clôturée%' then
    raise exception 'ÉCHEC (C2) : une vente d''une journée clôturée a pu être annulée (%).', v_msg;
  end if;

  -- 30 - 3 (S3) - 2 (S5) + 2 (annulation S5) = 27
  if (select quantity from public.products where id = v_savon) <> 27 then
    raise exception 'ÉCHEC (C2) : le stock a changé malgré le refus.';
  end if;

  -- ------------------------------------------------------------------
  -- C3 Encaissement d'une créance après clôture
  -- ------------------------------------------------------------------
  perform public.record_payment(v_s3.id, 7500, 'cash');

  v_inv := public.daily_invoice(d2);
  if (v_inv -> 'totals' ->> 'paid_amount')::numeric <> 75000
     or (v_inv -> 'closing' -> 'snapshot' -> 'totals' ->> 'paid_amount')::numeric <> 67500
     or v_inv -> 'closing' ->> 'status' <> 'closed'
     or (v_inv ->> 'can_reopen')::boolean then
    raise exception 'ÉCHEC (C3) : état actuel ou instantané figé incorrect : %', v_inv -> 'totals';
  end if;

  -- ------------------------------------------------------------------
  -- C4 Double clôture refusée, une seule facture par date
  -- ------------------------------------------------------------------
  v_raised := false;
  begin
    perform public.close_daily_invoice(d2);
  exception when others then
    v_raised := true;
  end;
  if not v_raised or (select count(*) from public.daily_invoices where user_id = v_owner and invoice_date = d2) <> 1 then
    raise exception 'ÉCHEC (C4) : la journée a pu être clôturée deux fois.';
  end if;

  -- ------------------------------------------------------------------
  -- C5 Réouverture : refusée au membre, motif obligatoire, tracée
  -- ------------------------------------------------------------------
  v_raised := false;
  begin
    perform public.reopen_daily_invoice(d2, 'Correction');
  exception when others then
    v_raised := true;
    v_msg := sqlerrm;
  end;
  if not v_raised or v_msg not like '%propriétaire%' then
    raise exception 'ÉCHEC (C5) : un membre a pu rouvrir la journée (%).', v_msg;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_owner::text, true);

  v_raised := false;
  begin
    perform public.reopen_daily_invoice(d2, '  ');
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'ÉCHEC (C5) : réouverture acceptée sans motif.';
  end if;

  v_row := public.reopen_daily_invoice(d2, 'Vente Rasoa saisie en double');
  if v_row.status <> 'reopened' or v_row.reopened_by <> v_owner then
    raise exception 'ÉCHEC (C5) : réouverture non enregistrée.';
  end if;

  -- ------------------------------------------------------------------
  -- C6 Correction puis nouvelle clôture : révision 2, journal complet
  -- ------------------------------------------------------------------
  perform public.cancel_sale(v_s3.id, 'Saisie en double');

  v_row := public.close_daily_invoice(d2);
  if v_row.revision <> 2 or v_row.status <> 'closed'
     or v_row.net_amount <> 115500 or v_row.sales_count <> 2 then
    raise exception 'ÉCHEC (C6) : nouvelle clôture incorrecte (rév. %, net %).', v_row.revision, v_row.net_amount;
  end if;

  select count(*) into v_count from public.daily_invoice_events where invoice_id = v_row.id;
  if v_count <> 3 then
    raise exception 'ÉCHEC (C6) : journal attendu : 3 événements, obtenu %.', v_count;
  end if;

  -- ------------------------------------------------------------------
  -- C7 Clôture d'une journée vide ou future refusée
  -- ------------------------------------------------------------------
  v_raised := false;
  begin
    perform public.close_daily_invoice(d3);
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'ÉCHEC (C7) : une journée sans vente a pu être clôturée.';
  end if;

  v_raised := false;
  begin
    perform public.close_daily_invoice(public.establishment_today() + 1);
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'ÉCHEC (C7) : une journée future a pu être clôturée.';
  end if;

  -- Le premier jour reste modifiable (non clôturé).
  v_s6 := public.create_sale(v_fanilo, d1,
    jsonb_build_array(jsonb_build_object('product_id', v_savon, 'quantity', 1, 'unit_price', 2500)));
  if (public.daily_invoice(d1) -> 'totals' ->> 'sales_count')::int <> 2 then
    raise exception 'ÉCHEC (C7) : la journée non clôturée devrait accepter les ventes.';
  end if;

  -- ------------------------------------------------------------------
  -- R1 Isolation : un autre espace ne voit rien
  -- ------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_other::text, true);

  v_inv := public.daily_invoice(d2);
  if (v_inv -> 'totals' ->> 'sales_count')::int <> 0 or v_inv -> 'closing' <> 'null'::jsonb then
    raise exception 'ÉCHEC (R1) : un autre espace voit la facture du jour.';
  end if;

  set local role authenticated;
  select count(*) into v_count from public.daily_invoices;
  if v_count <> 0 then
    raise exception 'ÉCHEC (R1) : RLS — % clôture(s) visible(s) depuis un autre espace.', v_count;
  end if;
  select count(*) into v_count from public.daily_invoice_events;
  if v_count <> 0 then
    raise exception 'ÉCHEC (R1) : RLS — journal visible depuis un autre espace.';
  end if;

  v_raised := false;
  begin
    insert into public.daily_invoices (user_id, invoice_date, invoice_number, status, snapshot)
    values (v_other, d3, 'FACT-20260114', 'closed', '{}'::jsonb);
  exception when insufficient_privilege then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'ÉCHEC (R1) : écriture directe dans daily_invoices autorisée.';
  end if;
  reset role;

  raise notice 'OK : tous les scénarios de la facture journalière sont validés.';
end;
$$;

rollback;
