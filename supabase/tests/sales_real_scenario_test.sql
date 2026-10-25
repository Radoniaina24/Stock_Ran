-- =====================================================================
-- Scénario réaliste : une journée de ventes dans un commerce malgache
--
-- Prérequis : migrations 0001 -> 0006 exécutées.
-- À exécuter dans le SQL Editor de Supabase (ou via
-- `supabase db query --linked -f supabase/tests/sales_real_scenario_test.sql`).
--
-- Catalogue et prix inspirés des données réelles (Ariary). Le script
-- complet est ANNULÉ à la fin (ROLLBACK) : aucune donnée n'est conservée.
-- En cas d'échec, une exception « ÉCHEC » indique l'étape fautive.
--
-- Étapes :
--   R1  fixation des prix de vente du catalogue
--   R2  vente grossiste multi-produits avec remise et acompte espèces
--   R3  règlements successifs MVola puis virement -> « Payée »
--   R4  grosse vente de ciment à crédit, puis paiement par chèque
--   R5  refus d'un paiement supérieur au solde restant dû
--   R6  prix négocié par ligne (école) réglé intégralement
--   R7  quantité décimale (2,5 kg de sucre) au comptoir
--   R8  refus d'une vente au stock insuffisant (savon)
--   R9  annulation d'une vente et réintégration du stock
--   R10 stocks finaux et mouvements tracés
--   R11 soldes par client (vue client_balances)
--   R12 annulation d'un paiement MVola -> créances recalculées
--   R13 synthèse du tableau de bord
--   R14 client archivé refusé
-- =====================================================================

begin;

do $$
declare
  v_user    uuid := '33333333-3333-4333-8333-333333333333';
  v_rasoa   public.clients%rowtype;
  v_rakoto  public.clients%rowtype;
  v_fanilo  public.clients%rowtype;
  v_comptoir public.clients%rowtype;
  v_ancien  public.clients%rowtype;
  v_sale    public.sales%rowtype;
  v_sale_rakoto public.sales%rowtype;
  v_sale_cancel public.sales%rowtype;
  v_pay     public.payments%rowtype;
  v_mvola   public.payments%rowtype;
  v_over    jsonb;
  v_riz     uuid;
  v_huile   uuid;
  v_sucre   uuid;
  v_ciment  uuid;
  v_cahier  uuid;
  v_savon   uuid;
  v_dentif  uuid;
  v_raised  boolean;
  v_msg     text;
  v_count   integer;
  v_qty     numeric;
  v_amount  numeric;
  v_amount2 numeric;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated',
    'scenario-reel@example.com', crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  -- ------------------------------------------------------------------
  -- R1 Catalogue (stocks identiques au magasin) et prix de vente
  -- ------------------------------------------------------------------
  insert into public.products (user_id, reference, name, category, unit, quantity, low_stock_threshold, sale_price)
  values (v_user, 'ALI-RIZ-001', 'Riz blanc Makalioka 50 kg', 'Alimentation', 'kg', 80, 100, 3200)
  returning id into v_riz;
  insert into public.products (user_id, reference, name, category, unit, quantity, low_stock_threshold, sale_price)
  values (v_user, 'ALI-HUI-002', 'Huile végétale Tiko 1 L (bouteille)', 'Alimentation', 'litre', 90, 36, 9500)
  returning id into v_huile;
  insert into public.products (user_id, reference, name, category, unit, quantity, low_stock_threshold, sale_price)
  values (v_user, 'ALI-SUC-003', 'Sucre blanc Sirama 1 kg', 'Alimentation', 'kg', 93.5, 30, 4800)
  returning id into v_sucre;
  insert into public.products (user_id, reference, name, category, unit, quantity, low_stock_threshold, sale_price)
  values (v_user, 'MAT-CIM-001', 'Ciment Holcim 50 kg', 'Matériaux', 'pièce', 57, 20, 38000)
  returning id into v_ciment;
  insert into public.products (user_id, reference, name, category, unit, quantity, low_stock_threshold, sale_price)
  values (v_user, 'FOU-CAH-001', 'Cahier 100 pages grands carreaux', 'Fournitures', 'pièce', 257, 50, 1800)
  returning id into v_cahier;
  insert into public.products (user_id, reference, name, category, unit, quantity, low_stock_threshold, sale_price)
  values (v_user, 'HYG-SAV-001', 'Savon de ménage Nosy 400 g', 'Hygiène', 'boîte', 4, 5, 2500)
  returning id into v_savon;
  insert into public.products (user_id, reference, name, category, unit, quantity, low_stock_threshold, sale_price)
  values (v_user, 'HYG-DEN-002', 'Dentifrice Colgate 75 ml', 'Hygiène', 'pièce', 40, 12, 4500)
  returning id into v_dentif;

  -- Clients : codes générés automatiquement dans l'ordre de création.
  insert into public.clients (user_id, name, phone, address)
  values (v_user, 'Épicerie Rasoa', '+261 34 12 345 67', 'Analakely, Antananarivo')
  returning * into v_rasoa;
  insert into public.clients (user_id, name, phone, email, address)
  values (v_user, 'Quincaillerie Rakoto & Fils', '+261 33 98 765 43', 'rakoto.quinc@gmail.com', 'Antsirabe')
  returning * into v_rakoto;
  insert into public.clients (user_id, name, phone, address)
  values (v_user, 'École privée Fanilo', '+261 32 45 678 90', 'Ambohijatovo, Antananarivo')
  returning * into v_fanilo;
  insert into public.clients (user_id, name)
  values (v_user, 'Client comptoir')
  returning * into v_comptoir;

  if v_rasoa.code <> 'CLI-0001' or v_comptoir.code <> 'CLI-0004' then
    raise exception 'ÉCHEC (R1) : codes clients attendus CLI-0001..CLI-0004 (%, %).',
      v_rasoa.code, v_comptoir.code;
  end if;

  -- ------------------------------------------------------------------
  -- R2 Épicerie Rasoa : 25 kg riz + 12 huiles + 10 kg sucre au prix
  --    catalogue, remise 7 000 Ar, acompte 100 000 Ar en espèces
  --    brut = 80 000 + 114 000 + 48 000 = 242 000 ; net = 235 000
  -- ------------------------------------------------------------------
  v_sale := public.create_sale(
    p_client_id       => v_rasoa.id,
    p_sale_date       => '2026-10-20'::date,
    p_items           => jsonb_build_array(
      jsonb_build_object('product_id', v_riz,   'quantity', 25),
      jsonb_build_object('product_id', v_huile, 'quantity', 12),
      jsonb_build_object('product_id', v_sucre, 'quantity', 10)
    ),
    p_discount_amount => 7000,
    p_payment_amount  => 100000,
    p_payment_method  => 'cash',
    p_comment         => 'Réassort hebdomadaire'
  );

  if v_sale.reference <> 'VTE-0001' or v_sale.subtotal <> 242000 or v_sale.total_amount <> 235000 then
    raise exception 'ÉCHEC (R2) : VTE-0001 / 242 000 / 235 000 attendus (%, %, %).',
      v_sale.reference, v_sale.subtotal, v_sale.total_amount;
  end if;
  if v_sale.payment_status <> 'partial' then
    raise exception 'ÉCHEC (R2) : statut « partial » attendu après acompte, obtenu « % ».', v_sale.payment_status;
  end if;

  select unit_price into v_amount from public.sale_items
  where sale_id = v_sale.id and product_id = v_huile;
  if v_amount <> 9500 then
    raise exception 'ÉCHEC (R2) : prix catalogue de l''huile attendu 9 500, obtenu %.', v_amount;
  end if;

  -- ------------------------------------------------------------------
  -- R3 Règlements successifs : 85 000 MVola puis 50 000 virement
  -- ------------------------------------------------------------------
  v_mvola := public.record_payment(v_sale.id, 85000, 'mobile_money', 'MVOLA-0345-221', 'Paiement MVola');

  select balance_due into v_amount from public.sale_balances where id = v_sale.id;
  if v_amount <> 50000 then
    raise exception 'ÉCHEC (R3) : solde attendu 50 000 après MVola, obtenu %.', v_amount;
  end if;

  perform public.record_payment(v_sale.id, 50000, 'bank_transfer', 'BOA-VIR-7781');

  select payment_status, balance_due, paid_amount, payments_count
  into v_msg, v_amount, v_amount2, v_count
  from public.sale_balances where id = v_sale.id;
  if v_msg <> 'paid' or v_amount <> 0 or v_amount2 <> 235000 or v_count <> 3 then
    raise exception 'ÉCHEC (R3) : « paid », solde 0, payé 235 000, 3 paiements attendus (%, %, %, %).',
      v_msg, v_amount, v_amount2, v_count;
  end if;

  -- ------------------------------------------------------------------
  -- R4 Quincaillerie Rakoto : 40 sacs de ciment à crédit, remise 20 000
  --    brut = 1 520 000 ; net = 1 500 000
  -- ------------------------------------------------------------------
  v_sale_rakoto := public.create_sale(
    p_client_id       => v_rakoto.id,
    p_sale_date       => '2026-10-21'::date,
    p_items           => jsonb_build_array(
      jsonb_build_object('product_id', v_ciment, 'quantity', 40, 'unit_price', 38000)),
    p_discount_amount => 20000
  );

  if v_sale_rakoto.total_amount <> 1500000 or v_sale_rakoto.payment_status <> 'unpaid' then
    raise exception 'ÉCHEC (R4) : 1 500 000 « unpaid » attendus (%, %).',
      v_sale_rakoto.total_amount, v_sale_rakoto.payment_status;
  end if;

  -- ------------------------------------------------------------------
  -- R5 Paiement supérieur au solde refusé
  -- ------------------------------------------------------------------
  v_raised := false;
  begin
    perform public.record_payment(v_sale_rakoto.id, 1500001, 'check');
  exception when others then
    v_raised := true;
    v_msg := SQLERRM;
  end;
  if not v_raised or v_msg not like 'Le montant dépasse le solde restant dû%' then
    raise exception 'ÉCHEC (R5) : un paiement de 1 500 001 Ar aurait dû être refusé (%).', v_msg;
  end if;

  v_pay := public.record_payment(v_sale_rakoto.id, 500000, 'check', 'CHQ-BNI-004512');

  select payment_status, balance_due into v_msg, v_amount
  from public.sale_balances where id = v_sale_rakoto.id;
  if v_msg <> 'partial' or v_amount <> 1000000 then
    raise exception 'ÉCHEC (R4) : « partial » et 1 000 000 restants attendus (%, %).', v_msg, v_amount;
  end if;

  -- ------------------------------------------------------------------
  -- R6 École Fanilo : 120 cahiers à prix négocié 1 650 Ar, payé comptant
  -- ------------------------------------------------------------------
  v_sale := public.create_sale(
    p_client_id      => v_fanilo.id,
    p_sale_date      => '2026-10-22'::date,
    p_items          => jsonb_build_array(
      jsonb_build_object('product_id', v_cahier, 'quantity', 120, 'unit_price', 1650)),
    p_payment_amount => 198000,
    p_payment_method => 'mobile_money',
    p_transaction_reference => 'ORANGE-MONEY-9921'
  );

  if v_sale.total_amount <> 198000 or v_sale.payment_status <> 'paid' then
    raise exception 'ÉCHEC (R6) : 198 000 « paid » attendus (%, %).', v_sale.total_amount, v_sale.payment_status;
  end if;

  -- ------------------------------------------------------------------
  -- R7 Comptoir : 2,5 kg de sucre = 12 000 Ar en espèces
  -- ------------------------------------------------------------------
  v_sale := public.create_sale(
    p_client_id      => v_comptoir.id,
    p_sale_date      => '2026-10-22'::date,
    p_items          => jsonb_build_array(
      jsonb_build_object('product_id', v_sucre, 'quantity', 2.5)),
    p_payment_amount => 12000
  );

  if v_sale.total_amount <> 12000 or v_sale.payment_status <> 'paid' then
    raise exception 'ÉCHEC (R7) : 12 000 « paid » attendus (%, %).', v_sale.total_amount, v_sale.payment_status;
  end if;

  -- ------------------------------------------------------------------
  -- R8 Stock insuffisant : 5 boîtes de savon demandées, 4 disponibles
  -- ------------------------------------------------------------------
  v_raised := false;
  begin
    perform public.create_sale(
      p_client_id => v_comptoir.id,
      p_sale_date => '2026-10-22'::date,
      p_items     => jsonb_build_array(
        jsonb_build_object('product_id', v_dentif, 'quantity', 1),
        jsonb_build_object('product_id', v_savon,  'quantity', 5))
    );
  exception when others then
    v_raised := true;
    v_msg := SQLERRM;
  end;
  if not v_raised or v_msg not like 'Stock insuffisant pour « Savon de ménage Nosy 400 g »%' then
    raise exception 'ÉCHEC (R8) : refus « Stock insuffisant » attendu, obtenu « % ».', v_msg;
  end if;

  select quantity into v_qty from public.products where id = v_dentif;
  if v_qty <> 40 then
    raise exception 'ÉCHEC (R8) : le dentifrice ne doit pas bouger lors d''un refus (%).', v_qty;
  end if;

  -- ------------------------------------------------------------------
  -- R9 Annulation : 3 dentifrices vendus puis vente annulée
  -- ------------------------------------------------------------------
  v_sale_cancel := public.create_sale(
    p_client_id => v_comptoir.id,
    p_sale_date => '2026-10-22'::date,
    p_items     => jsonb_build_array(
      jsonb_build_object('product_id', v_dentif, 'quantity', 3))
  );

  select quantity into v_qty from public.products where id = v_dentif;
  if v_qty <> 37 then
    raise exception 'ÉCHEC (R9) : 37 dentifrices attendus après la vente, obtenu %.', v_qty;
  end if;

  perform public.cancel_sale(v_sale_cancel.id, 'Client a changé d''avis');

  select quantity into v_qty from public.products where id = v_dentif;
  if v_qty <> 40 then
    raise exception 'ÉCHEC (R9) : 40 dentifrices attendus après annulation, obtenu %.', v_qty;
  end if;

  -- ------------------------------------------------------------------
  -- R10 Stocks finaux et traçabilité
  -- ------------------------------------------------------------------
  select quantity into v_qty from public.products where id = v_riz;
  if v_qty <> 55 then raise exception 'ÉCHEC (R10) : riz attendu 55, obtenu %.', v_qty; end if;
  select quantity into v_qty from public.products where id = v_huile;
  if v_qty <> 78 then raise exception 'ÉCHEC (R10) : huile attendue 78, obtenu %.', v_qty; end if;
  select quantity into v_qty from public.products where id = v_sucre;
  if v_qty <> 81 then raise exception 'ÉCHEC (R10) : sucre attendu 81, obtenu %.', v_qty; end if;
  select quantity into v_qty from public.products where id = v_ciment;
  if v_qty <> 17 then raise exception 'ÉCHEC (R10) : ciment attendu 17, obtenu %.', v_qty; end if;
  select quantity into v_qty from public.products where id = v_cahier;
  if v_qty <> 137 then raise exception 'ÉCHEC (R10) : cahiers attendus 137, obtenu %.', v_qty; end if;
  select quantity into v_qty from public.products where id = v_savon;
  if v_qty <> 4 then raise exception 'ÉCHEC (R10) : savon attendu 4, obtenu %.', v_qty; end if;

  select stock_status into v_msg from public.products where id = v_ciment;
  if v_msg <> 'low' then
    raise exception 'ÉCHEC (R10) : le ciment (17 <= seuil 20) doit passer en stock faible (%).', v_msg;
  end if;

  select count(*) into v_count from public.stock_movements
  where user_id = v_user and reason = 'vente';
  if v_count <> 7 then
    raise exception 'ÉCHEC (R10) : 7 mouvements « vente » attendus, obtenu %.', v_count;
  end if;

  select count(*) into v_count from public.stock_movements
  where user_id = v_user and reason = 'vente' and comment = 'VTE-0001';
  if v_count <> 3 then
    raise exception 'ÉCHEC (R10) : 3 mouvements liés à VTE-0001 attendus, obtenu %.', v_count;
  end if;

  -- ------------------------------------------------------------------
  -- R11 Soldes par client
  -- ------------------------------------------------------------------
  select total_sales, total_paid, balance_due, open_sales_count
  into v_amount, v_amount2, v_qty, v_count
  from public.client_balances where client_id = v_rakoto.id;
  if v_amount <> 1500000 or v_amount2 <> 500000 or v_qty <> 1000000 or v_count <> 1 then
    raise exception 'ÉCHEC (R11) : Rakoto 1 500 000 / 500 000 / 1 000 000 / 1 attendus (%, %, %, %).',
      v_amount, v_amount2, v_qty, v_count;
  end if;

  select sales_count, total_sales into v_count, v_amount
  from public.client_balances where client_id = v_comptoir.id;
  if v_count <> 1 or v_amount <> 12000 then
    raise exception 'ÉCHEC (R11) : la vente annulée ne doit pas compter pour le comptoir (%, %).', v_count, v_amount;
  end if;

  -- ------------------------------------------------------------------
  -- R12 Annulation du paiement MVola de Rasoa
  -- ------------------------------------------------------------------
  perform public.cancel_payment(v_mvola.id, 'Transaction MVola rejetée');

  select payment_status, balance_due into v_msg, v_amount
  from public.sale_balances where client_id = v_rasoa.id;
  if v_msg <> 'partial' or v_amount <> 85000 then
    raise exception 'ÉCHEC (R12) : Rasoa « partial » / 85 000 dus attendus (%, %).', v_msg, v_amount;
  end if;

  -- ------------------------------------------------------------------
  -- R13 Synthèse du tableau de bord
  --   ventes   = 235 000 + 1 500 000 + 198 000 + 12 000 = 1 945 000
  --   encaissé = 150 000 + 500 000 + 198 000 + 12 000   =   860 000
  --   créances = 85 000 + 1 000 000                      = 1 085 000
  -- ------------------------------------------------------------------
  v_over := public.sales_overview();

  if (v_over->>'total_sales')::numeric <> 1945000
     or (v_over->>'total_paid')::numeric <> 860000
     or (v_over->>'total_receivables')::numeric <> 1085000 then
    raise exception 'ÉCHEC (R13) : 1 945 000 / 860 000 / 1 085 000 attendus (%, %, %).',
      v_over->>'total_sales', v_over->>'total_paid', v_over->>'total_receivables';
  end if;
  if (v_over->>'sales_count')::int <> 4 or (v_over->>'receivables_count')::int <> 2 then
    raise exception 'ÉCHEC (R13) : 4 ventes et 2 créances attendues (%, %).',
      v_over->>'sales_count', v_over->>'receivables_count';
  end if;
  if v_over->'top_products'->0->>'reference' <> 'FOU-CAH-001' then
    raise exception 'ÉCHEC (R13) : les cahiers (120 unités) doivent être le produit le plus vendu (%).',
      v_over->'top_products'->0->>'reference';
  end if;

  -- ------------------------------------------------------------------
  -- R14 Client archivé refusé
  -- ------------------------------------------------------------------
  insert into public.clients (user_id, name, is_active)
  values (v_user, 'Ancien client', false)
  returning * into v_ancien;

  v_raised := false;
  begin
    perform public.create_sale(
      p_client_id => v_ancien.id,
      p_sale_date => '2026-10-22'::date,
      p_items     => jsonb_build_array(jsonb_build_object('product_id', v_riz, 'quantity', 1)));
  exception when others then
    v_raised := true;
    v_msg := SQLERRM;
  end;
  if not v_raised or v_msg not like '%est archivé%' then
    raise exception 'ÉCHEC (R14) : une vente sur un client archivé aurait dû être refusée (%).', v_msg;
  end if;

  raise notice '✔ SCÉNARIO RÉALISTE PASSÉ (étapes R1 à R14).';
end $$;

rollback;
