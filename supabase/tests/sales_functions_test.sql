-- =====================================================================
-- Tests des fonctions de vente, de paiement et d annulation
--
-- Prérequis : migrations 0001 -> 0006 exécutées.
-- À exécuter dans le SQL Editor de Supabase (ou sur une base locale).
--
-- Le script complet est ANNULÉ à la fin (ROLLBACK) : aucune donnée de
-- test n'est conservée. En cas d'échec, une exception « ÉCHEC » est
-- levée et le script s'arrête en affichant le scénario fautif.
--
-- Couverture (cf. §15 du cahier des charges) :
--   #1  création d'un client (code généré automatiquement)
--   #2  vente multi-produits
--   #3  déduction du stock et mouvements de sortie
--   #4  calcul du montant brut, de la remise et du montant net
--   #5  vente sans paiement              -> « Non payée »
--   #6  paiement partiel                 -> « Partiellement payée »
--   #7  solde réglé                      -> « Payée », solde 0
--   #8  refus d'un paiement supérieur au solde restant dû
--   #9  refus d'une vente au stock insuffisant (aucune écriture)
--   #10 paiements multiples tracés séparément
--   #11 créances totales sans doublon
--   #12 annulation d'une vente et réintégration du stock
--   #13 prix d'origine conservés après changement du prix du produit
--   #14 isolation RLS entre deux utilisateurs
--   #15 remise négative ou supérieure au montant brut refusée
--   #16 vente à montant nul : soldée, aucune dette artificielle
--   #17 client avec ventes non supprimable
--   #18 statistiques du tableau de bord
--
-- Le scénario de concurrence réelle (deux sessions simultanées) est
-- décrit dans le README.md.
-- =====================================================================

begin;

do $$
declare
  v_user   uuid := '11111111-1111-4111-8111-111111111111';
  v_other  uuid := '22222222-2222-4222-8222-222222222222';
  v_client public.clients%rowtype;
  v_sale   public.sales%rowtype;
  v_sale2  public.sales%rowtype;
  v_sale3  public.sales%rowtype;
  v_free   public.sales%rowtype;
  v_pay    public.payments%rowtype;
  v_over   jsonb;
  v_pa     uuid;
  v_pb     uuid;
  v_raised boolean;
  v_msg    text;
  v_msg2   text;
  v_count  integer;
  v_qty    numeric;
  v_amount numeric;
begin
  -- ------------------------------------------------------------------
  -- Utilisateurs de test
  -- ------------------------------------------------------------------
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values
    ('00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated',
      'sale-test-a@example.com', crypt('password', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', v_other, 'authenticated', 'authenticated',
      'sale-test-b@example.com', crypt('password', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now());

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated', 'email', 'sale-test-a@example.com')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  -- ------------------------------------------------------------------
  -- Produits de test avec du stock et un prix de vente
  -- ------------------------------------------------------------------
  insert into public.products (user_id, reference, name, unit, quantity, low_stock_threshold, sale_price)
  values (v_user, 'V-A', 'Produit A', 'pièce', 10, 2, 1000)
  returning id into v_pa;

  insert into public.products (user_id, reference, name, unit, quantity, low_stock_threshold, sale_price)
  values (v_user, 'V-B', 'Produit B', 'pièce', 5, 1, 500)
  returning id into v_pb;

  -- ------------------------------------------------------------------
  -- #1 Création d'un client : code généré automatiquement
  -- ------------------------------------------------------------------
  insert into public.clients (user_id, name, phone)
  values (v_user, 'Client Test', '+261 34 00 00 00')
  returning * into v_client;

  if v_client.code is null or v_client.code <> 'CLI-0001' then
    raise exception 'ÉCHEC (#1) : code client attendu CLI-0001, obtenu « % ».', v_client.code;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);

  -- ------------------------------------------------------------------
  -- #2 / #4 Vente multi-produits avec remise
  -- ------------------------------------------------------------------
  v_sale := public.create_sale(
    p_client_id => v_client.id,
    p_sale_date  => '2026-10-10'::date,
    p_items      => jsonb_build_array(
      jsonb_build_object('product_id', v_pa, 'quantity', 3, 'unit_price', 1000),
      jsonb_build_object('product_id', v_pb, 'quantity', 2, 'unit_price', 450)
    ),
    p_discount_amount => 200,
    p_comment         => 'Première vente de test'
  );

  if v_sale.reference is distinct from 'VTE-0001' then
    raise exception 'ÉCHEC (#2) : référence attendue VTE-0001, obtenue « % ».', v_sale.reference;
  end if;
  if v_sale.subtotal <> 3900 then
    raise exception 'ÉCHEC (#4) : montant brut attendu 3900, obtenu %.', v_sale.subtotal;
  end if;
  if v_sale.total_amount <> 3700 then
    raise exception 'ÉCHEC (#4) : montant net attendu 3700, obtenu %.', v_sale.total_amount;
  end if;
  if v_sale.payment_status <> 'unpaid' then
    raise exception 'ÉCHEC (#5) : statut attendu « unpaid », obtenu « % ».', v_sale.payment_status;
  end if;

  -- ------------------------------------------------------------------
  -- #3 Déduction du stock et mouvements de sortie
  -- ------------------------------------------------------------------
  select quantity into v_qty from public.products where id = v_pa;
  if v_qty <> 7 then
    raise exception 'ÉCHEC (#3) : stock A attendu 7, obtenu %.', v_qty;
  end if;

  select quantity into v_qty from public.products where id = v_pb;
  if v_qty <> 3 then
    raise exception 'ÉCHEC (#3) : stock B attendu 3, obtenu %.', v_qty;
  end if;

  select count(*) into v_count from public.stock_movements where reason = 'vente';
  if v_count <> 2 then
    raise exception 'ÉCHEC (#3) : 2 mouvements de sortie « vente » attendus, obtenu %.', v_count;
  end if;

  select count(*) into v_count from public.sale_items where sale_id = v_sale.id;
  if v_count <> 2 then
    raise exception 'ÉCHEC (#2) : 2 lignes de vente attendues, obtenu %.', v_count;
  end if;

  -- ------------------------------------------------------------------
  -- #13 Prix unitaire figé sur la ligne de vente
  -- ------------------------------------------------------------------
  select unit_price into v_amount from public.sale_items
  where sale_id = v_sale.id and product_reference_snapshot = 'V-B';
  if v_amount <> 450 then
    raise exception 'ÉCHEC (#13) : prix figé attendu 450, obtenu %.', v_amount;
  end if;

  -- ------------------------------------------------------------------
  -- #11 Créances sans doublon (une vente = une ligne)
  -- ------------------------------------------------------------------
  select count(*), coalesce(sum(balance_due), 0) into v_count, v_amount
  from public.sale_balances;

  if v_count <> 1 or v_amount <> 3700 then
    raise exception 'ÉCHEC (#11) : 1 vente et 3700 Ar de créances attendus (%, %).', v_count, v_amount;
  end if;

  -- ------------------------------------------------------------------
  -- #6 Paiement partiel
  -- ------------------------------------------------------------------
  v_pay := public.record_payment(v_sale.id, 1000, 'cash');

  if v_pay.reference is distinct from 'PAY-0001' then
    raise exception 'ÉCHEC (#10) : référence de paiement attendue PAY-0001, obtenue « % ».', v_pay.reference;
  end if;

  select payment_status, balance_due into v_msg, v_amount
  from public.sale_balances where id = v_sale.id;

  if v_msg <> 'partial' then
    raise exception 'ÉCHEC (#6) : statut attendu « partial », obtenu « % ».', v_msg;
  end if;
  if v_amount <> 2700 then
    raise exception 'ÉCHEC (#6) : solde attendu 2700, obtenu %.', v_amount;
  end if;

  -- ------------------------------------------------------------------
  -- #8 Refus d un paiement supérieur au solde restant dû
  -- ------------------------------------------------------------------
  v_raised := false;
  begin
    perform public.record_payment(v_sale.id, 2701, 'cash');
  exception when others then
    v_raised := true;
    v_msg := SQLERRM;
  end;
  if not v_raised then
    raise exception 'ÉCHEC (#8) : un paiement supérieur au solde aurait dû être refusé.';
  end if;
  if v_msg not like 'Le montant dépasse le solde restant dû%' then
    raise exception 'ÉCHEC (#8) : message inattendu « % ».', v_msg;
  end if;

  v_raised := false;
  begin
    perform public.record_payment(v_sale.id, 0, 'cash');
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'ÉCHEC (#8) : un paiement nul aurait dû être refusé.';
  end if;

  -- ------------------------------------------------------------------
  -- #10 Paiements multiples pour une même vente
  -- ------------------------------------------------------------------
  perform public.record_payment(v_sale.id, 700, 'mobile_money', 'MM-001');

  select count(*), sum(amount) into v_count, v_amount
  from public.payments where sale_id = v_sale.id and status = 'validated';

  if v_count <> 2 or v_amount <> 1700 then
    raise exception 'ÉCHEC (#10) : 2 paiements / 1700 Ar attendus (%, %).', v_count, v_amount;
  end if;

  -- ------------------------------------------------------------------
  -- #7 Règlement complet du solde
  -- ------------------------------------------------------------------
  perform public.record_payment(v_sale.id, 2000, 'bank_transfer');

  select payment_status, balance_due, paid_amount into v_msg, v_amount, v_qty
  from public.sale_balances where id = v_sale.id;

  if v_msg <> 'paid' then
    raise exception 'ÉCHEC (#7) : statut attendu « paid », obtenu « % ».', v_msg;
  end if;
  if v_amount <> 0 or v_qty <> 3700 then
    raise exception 'ÉCHEC (#7) : solde 0 / payé 3700 attendus (%, %).', v_amount, v_qty;
  end if;

  v_raised := false;
  begin
    perform public.record_payment(v_sale.id, 1, 'cash');
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'ÉCHEC (#8) : un paiement sur une vente réglée aurait dû être refusé.';
  end if;

  -- ------------------------------------------------------------------
  -- #15 Contrôles de la remise
  -- ------------------------------------------------------------------
  v_raised := false;
  begin
    perform public.create_sale(
      p_client_id => v_client.id,
      p_sale_date  => '2026-10-11'::date,
      p_items      => jsonb_build_array(
        jsonb_build_object('product_id', v_pa, 'quantity', 1, 'unit_price', 1000)),
      p_discount_amount => -1
    );
  exception when others then
    v_raised := true;
    v_msg := SQLERRM;
  end;
  if not v_raised then
    raise exception 'ÉCHEC (#15) : une remise négative aurait dû être refusée.';
  end if;
  if v_msg not like 'La remise ne peut pas être négative%' then
    raise exception 'ÉCHEC (#15) : message inattendu « % ».', v_msg;
  end if;

  v_raised := false;
  begin
    perform public.create_sale(
      p_client_id => v_client.id,
      p_sale_date  => '2026-10-11'::date,
      p_items      => jsonb_build_array(
        jsonb_build_object('product_id', v_pa, 'quantity', 1, 'unit_price', 1000)),
      p_discount_amount => 1001
    );
  exception when others then
    v_raised := true;
    v_msg := SQLERRM;
  end;
  if not v_raised then
    raise exception 'ÉCHEC (#15) : une remise supérieure au brut aurait dû être refusée.';
  end if;
  if v_msg not like 'La remise ne peut pas dépasser le montant brut%' then
    raise exception 'ÉCHEC (#15) : message inattendu « % ».', v_msg;
  end if;

  -- ------------------------------------------------------------------
  -- #9 Stock insuffisant : refus total, aucune écriture
  -- ------------------------------------------------------------------
  v_raised := false;
  begin
    perform public.create_sale(
      p_client_id => v_client.id,
      p_sale_date  => '2026-10-11'::date,
      p_items      => jsonb_build_array(
        jsonb_build_object('product_id', v_pa, 'quantity', 999, 'unit_price', 1000))
    );
  exception when others then
    v_raised := true;
    v_msg := SQLERRM;
  end;
  if not v_raised then
    raise exception 'ÉCHEC (#9) : une vente au stock insuffisant aurait dû être refusée.';
  end if;
  if v_msg not like 'Stock insuffisant%' then
    raise exception 'ÉCHEC (#9) : message inattendu « % ».', v_msg;
  end if;

  select count(*) into v_count from public.sales;
  if v_count <> 1 then
    raise exception 'ÉCHEC (#9) : une seule vente attendue après les refus, obtenu %.', v_count;
  end if;

  select quantity into v_qty from public.products where id = v_pa;
  if v_qty <> 7 then
    raise exception 'ÉCHEC (#9) : le stock A a été modifié malgré le refus (%).', v_qty;
  end if;

  -- Deuxième vente : épuise le stock restant du produit A.
  v_sale2 := public.create_sale(
    p_client_id => v_client.id,
    p_sale_date  => '2026-10-11'::date,
    p_items      => jsonb_build_array(
      jsonb_build_object('product_id', v_pa, 'quantity', 7, 'unit_price', 1000))
  );

  select quantity into v_qty from public.products where id = v_pa;
  if v_qty <> 0 then
    raise exception 'ÉCHEC (#9) : stock A attendu 0, obtenu %.', v_qty;
  end if;

  -- Toute nouvelle demande sur un stock épuisé reste refusée.
  v_raised := false;
  begin
    perform public.create_sale(
      p_client_id => v_client.id,
      p_sale_date  => '2026-10-11'::date,
      p_items      => jsonb_build_array(
        jsonb_build_object('product_id', v_pa, 'quantity', 1, 'unit_price', 1000))
    );
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'ÉCHEC (#18) : une requête simultanée sur stock épuisé aurait dû être refusée.';
  end if;

  -- ------------------------------------------------------------------
  -- #16 Vente à montant nul : soldée, sans dette artificielle
  -- ------------------------------------------------------------------
  v_free := public.create_sale(
    p_client_id => v_client.id,
    p_sale_date  => '2026-10-12'::date,
    p_items      => jsonb_build_array(
      jsonb_build_object('product_id', v_pb, 'quantity', 1, 'unit_price', 0))
  );

  if v_free.payment_status <> 'paid' or v_free.total_amount <> 0 then
    raise exception 'ÉCHEC (#16) : vente gratuite attendue « paid » à 0 (%, %).',
      v_free.payment_status, v_free.total_amount;
  end if;

  v_raised := false;
  begin
    perform public.record_payment(v_free.id, 1, 'cash');
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'ÉCHEC (#16) : un paiement sur une vente à zéro aurait dû être refusé.';
  end if;

  -- ------------------------------------------------------------------
  -- #13 Le changement de prix du produit ne modifie pas les ventes
  -- ------------------------------------------------------------------
  update public.products set sale_price = 9999 where id = v_pa;

  select count(*) into v_count from public.sale_items
  where product_id = v_pa and unit_price <> 1000;

  if v_count <> 0 then
    raise exception 'ÉCHEC (#13) : % ligne(s) de vente ont été recalculées avec le nouveau prix.', v_count;
  end if;

  -- ------------------------------------------------------------------
  -- #17 Un client avec des ventes ne peut pas être supprimé
  -- ------------------------------------------------------------------
  set local role authenticated;
  delete from public.clients where id = v_client.id;

  select count(*) into v_count from public.clients;
  if v_count <> 1 then
    raise exception 'ÉCHEC (#17) : le client avec ventes aurait dû être conservé (% restant).', v_count;
  end if;
  reset role;

  -- ------------------------------------------------------------------
  -- #12 Annulation d'une vente : réintégration du stock
  -- ------------------------------------------------------------------
  v_sale3 := public.create_sale(
    p_client_id => v_client.id,
    p_sale_date  => '2026-10-13'::date,
    p_items      => jsonb_build_array(
      jsonb_build_object('product_id', v_pb, 'quantity', 2, 'unit_price', 500))
  );

  select quantity into v_qty from public.products where id = v_pb;
  if v_qty <> 0 then
    raise exception 'ÉCHEC (#12) : stock B attendu 0 avant annulation, obtenu %.', v_qty;
  end if;

  perform public.cancel_sale(v_sale3.id, 'Erreur de saisie');

  select quantity into v_qty from public.products where id = v_pb;
  if v_qty <> 2 then
    raise exception 'ÉCHEC (#12) : stock B réintégré attendu 2, obtenu %.', v_qty;
  end if;

  select status, payment_status into v_msg, v_msg2
  from public.sales where id = v_sale3.id;

  if v_msg <> 'cancelled' or v_msg2 <> 'cancelled' then
    raise exception 'ÉCHEC (#12) : statuts « cancelled » / « cancelled » attendus, obtenus « % » / « % ».',
      v_msg, v_msg2;
  end if;

  select count(*) into v_count from public.stock_movements where reason = 'annulation de vente';
  if v_count <> 1 then
    raise exception 'ÉCHEC (#12) : 1 mouvement de retour attendu, obtenu %.', v_count;
  end if;

  select balance_due into v_amount from public.sale_balances where id = v_sale3.id;
  if v_amount <> 0 then
    raise exception 'ÉCHEC (#12) : la vente annulée ne doit plus être une créance (%).', v_amount;
  end if;

  v_raised := false;
  begin
    perform public.cancel_sale(v_sale3.id, null);
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'ÉCHEC (#12) : une double annulation aurait dû être refusée.';
  end if;

  -- ------------------------------------------------------------------
  -- #18 Statistiques du tableau de bord
  -- ------------------------------------------------------------------
  v_over := public.sales_overview();

  -- ventes non annulées : 3700 (VTE-0001) + 7000 (VTE-0002) + 0 (VTE-0003)
  if (v_over->>'total_sales')::numeric <> 10700 then
    raise exception 'ÉCHEC (#18) : chiffre d''affaires attendu 10700, obtenu %.',
      v_over->>'total_sales';
  end if;
  if (v_over->>'total_paid')::numeric <> 3700 then
    raise exception 'ÉCHEC (#18) : encaissements attendus 3700, obtenu %.', v_over->>'total_paid';
  end if;
  if (v_over->>'total_receivables')::numeric <> 7000 then
    raise exception 'ÉCHEC (#18) : créances attendues 7000, obtenu %.', v_over->>'total_receivables';
  end if;
  if (v_over->>'unpaid_count')::int <> 1
     or (v_over->>'partial_count')::int <> 0
     or (v_over->>'paid_count')::int <> 2 then
    raise exception 'ÉCHEC (#18) : répartition attendue 1 / 0 / 2, obtenu % / % / %.',
      v_over->>'unpaid_count', v_over->>'partial_count', v_over->>'paid_count';
  end if;
  if (v_over->>'total_sales')::numeric
     <> (v_over->>'total_paid')::numeric + (v_over->>'total_receivables')::numeric then
    raise exception 'ÉCHEC (#18) : ventes <> encaissements + créances.';
  end if;
  if jsonb_array_length(v_over->'latest_sales') <> 3
     or jsonb_array_length(v_over->'top_products') = 0 then
    raise exception 'ÉCHEC (#18) : dernières ventes ou produits les plus vendus absents.';
  end if;

  -- ------------------------------------------------------------------
  -- Annulation tracée d un paiement (jamais de suppression)
  -- ------------------------------------------------------------------
  v_pay := public.cancel_payment((select id from public.payments
                                   where sale_id = v_sale.id and amount = 700), 'Saisie erronée');

  if v_pay.status <> 'cancelled' then
    raise exception 'ÉCHEC : le paiement annulé doit rester « cancelled ».';
  end if;

  select count(*) into v_count from public.payments where sale_id = v_sale.id;
  if v_count <> 3 then
    raise exception 'ÉCHEC : les paiements validés ne doivent jamais être supprimés (%).', v_count;
  end if;

  select payment_status, balance_due into v_msg, v_amount
  from public.sale_balances where id = v_sale.id;

  if v_msg <> 'partial' or v_amount <> 700 then
    raise exception 'ÉCHEC : après annulation, statut « partial » et solde 700 attendus (%, %).',
      v_msg, v_amount;
  end if;

  v_raised := false;
  begin
    perform public.cancel_payment(v_pay.id, null);
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'ÉCHEC : une double annulation de paiement aurait dû être refusée.';
  end if;

  -- ------------------------------------------------------------------
  -- #14 Isolation RLS entre deux utilisateurs
  -- ------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated', 'email', 'sale-test-b@example.com')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', v_other::text, true);
  set local role authenticated;

  select count(*) into v_count from public.clients;
  if v_count <> 0 then
    raise exception 'ÉCHEC (#14) : un utilisateur voit les clients d''un autre (%).', v_count;
  end if;

  select count(*) into v_count from public.sales;
  if v_count <> 0 then
    raise exception 'ÉCHEC (#14) : un utilisateur voit les ventes d''un autre (%).', v_count;
  end if;

  select count(*) into v_count from public.payments;
  if v_count <> 0 then
    raise exception 'ÉCHEC (#14) : un utilisateur voit les paiements d''un autre (%).', v_count;
  end if;

  select count(*) into v_count from public.sale_items;
  if v_count <> 0 then
    raise exception 'ÉCHEC (#14) : un utilisateur voit les lignes de vente d''un autre (%).', v_count;
  end if;

  select count(*) into v_count from public.client_balances;
  if v_count <> 0 then
    raise exception 'ÉCHEC (#14) : la vue client_balances fuit entre utilisateurs (%).', v_count;
  end if;

  v_raised := false;
  begin
    perform public.create_sale(
      p_client_id => v_client.id,
      p_sale_date  => '2026-10-15'::date,
      p_items      => jsonb_build_array(
        jsonb_build_object('product_id', v_pa, 'quantity', 1, 'unit_price', 1))
    );
  exception when others then
    v_raised := true;
    v_msg := SQLERRM;
  end;
  if not v_raised then
    raise exception 'ÉCHEC (#14) : une vente sur le client d''un autre a été acceptée.';
  end if;
  if v_msg <> 'Client introuvable.' then
    raise exception 'ÉCHEC (#14) : message inattendu « % ».', v_msg;
  end if;

  v_raised := false;
  begin
    insert into public.sales (user_id, reference, client_id)
    values (v_other, 'FRAUDE-1', v_client.id);
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'ÉCHEC (#14) : une écriture directe sur sales a été acceptée.';
  end if;

  v_raised := false;
  begin
    insert into public.payments (user_id, reference, sale_id, client_id, amount, payment_method)
    values (v_other, 'FRAUDE-2', v_sale.id, v_client.id, 1, 'cash');
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'ÉCHEC (#14) : une écriture directe sur payments a été acceptée.';
  end if;

  -- Le deuxième utilisateur peut créer son propre client.
  insert into public.clients (user_id, name)
  values (v_other, 'Client de B');

  select count(*) into v_count from public.clients;
  if v_count <> 1 then
    raise exception 'ÉCHEC (#14) : B ne voit que son propre client (obtenu %).', v_count;
  end if;

  reset role;

  raise notice '✔ TOUS LES TESTS DES VENTES SONT PASSÉS (scénarios #1 à #18).';
end $$;

rollback;
