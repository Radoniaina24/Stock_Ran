-- =====================================================================
-- Tests des fonctions de stock et des règles d'intégrité
--
-- Prérequis : migrations 0001, 0002 et 0003 exécutées.
-- À exécuter dans le SQL Editor de Supabase.
--
-- Le script complet est ANNULÉ à la fin (ROLLBACK) : aucune donnée de
-- test n'est conservée. En cas d'échec, une exception « ÉCHEC » est
-- levée et le script s'arrête en affichant le scénario fautif.
--
-- Couverture (voir §17 du cahier des charges) :
--   #1 création de produit, #2 nom obligatoire, #3 référence en double,
--   #4 modification sans toucher à la quantité, #5 entrée 0 -> 10,
--   #6 sortie 10 -> 7, #7 sortie refusée, #8 quantités invalides,
--   #10 historique avant/après, #12 isolation entre utilisateurs,
--   #13 produits archivés visibles dans l'historique.
--
-- Le scénario #9 (deux sorties simultanées) nécessite deux sessions et
-- est décrit dans le README.md.
-- =====================================================================

begin;

do $$
declare
  v_user          uuid := gen_random_uuid();
  v_other         uuid := gen_random_uuid();
  v_product       public.products%rowtype;
  v_entry         public.stock_movements%rowtype;
  v_adjust        public.stock_movements%rowtype;
  v_qty           numeric;
  v_last          numeric;
  v_count         integer;
  v_raised        boolean;
  v_msg           text;
begin
  -- ------------------------------------------------------------------
  -- Utilisateurs de test
  -- ------------------------------------------------------------------
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values
    ('00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated',
      'stock-test-a@example.com', crypt('password', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', v_other, 'authenticated', 'authenticated',
      'stock-test-b@example.com', crypt('password', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now());

  -- Contexte d'authentification simulé (auth.uid())
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated', 'email', 'stock-test-a@example.com')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  -- ------------------------------------------------------------------
  -- #1 Création d'un produit
  -- ------------------------------------------------------------------
  insert into public.products (user_id, reference, name, unit, low_stock_threshold)
  values (v_user, 'TST-001', 'Produit test', 'pièce', 3)
  returning * into v_product;

  if v_product.quantity <> 0 then
    raise exception 'ÉCHEC (#1) : la quantité initiale doit être égale à 0.';
  end if;
  if v_product.stock_status <> 'low' then
    raise exception 'ÉCHEC (#1) : le statut calculé devrait être « low » (0 <= seuil 3).';
  end if;

  -- ------------------------------------------------------------------
  -- #2 Refus d'un produit sans nom
  -- ------------------------------------------------------------------
  v_raised := false;
  begin
    insert into public.products (user_id, reference, name, unit)
    values (v_user, 'TST-NONOM', '   ', 'pièce');
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'ÉCHEC (#2) : un produit sans nom aurait dû être refusé.';
  end if;

  -- ------------------------------------------------------------------
  -- #3 Refus d'une référence en double pour un même utilisateur
  -- ------------------------------------------------------------------
  v_raised := false;
  begin
    insert into public.products (user_id, reference, name, unit)
    values (v_user, 'TST-001', 'Doublon', 'pièce');
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'ÉCHEC (#3) : une référence en double aurait dû être refusée.';
  end if;

  -- ... mais autorisée pour un autre utilisateur
  insert into public.products (user_id, reference, name, unit)
  values (v_other, 'TST-001', 'Produit de B', 'pièce');

  -- ------------------------------------------------------------------
  -- #5 Entrée de 10 unités : stock de 0 à 10
  -- ------------------------------------------------------------------
  v_entry := public.record_stock_entry(v_product.id, 10, 'réception', 'Livraison fournisseur');

  select quantity into v_qty from public.products where id = v_product.id;
  if v_qty <> 10 then
    raise exception 'ÉCHEC (#5) : stock attendu 10, obtenu %.', v_qty;
  end if;
  if v_entry.quantity_before <> 0 or v_entry.quantity_after <> 10 then
    raise exception 'ÉCHEC (#5) : quantités avant/après incorrectes (% -> %).',
      v_entry.quantity_before, v_entry.quantity_after;
  end if;

  -- ------------------------------------------------------------------
  -- #6 Sortie de 3 unités : stock de 10 à 7
  -- ------------------------------------------------------------------
  v_entry := public.record_stock_exit(v_product.id, 3, 'utilisation interne', null);

  select quantity into v_qty from public.products where id = v_product.id;
  if v_qty <> 7 then
    raise exception 'ÉCHEC (#6) : stock attendu 7, obtenu %.', v_qty;
  end if;
  if v_entry.quantity_before <> 10 or v_entry.quantity_after <> 7 then
    raise exception 'ÉCHEC (#6) : quantités avant/après incorrectes (% -> %).',
      v_entry.quantity_before, v_entry.quantity_after;
  end if;

  -- ------------------------------------------------------------------
  -- #7 Refus d'une sortie de 8 unités alors que le stock est de 7
  -- ------------------------------------------------------------------
  v_raised := false;
  begin
    perform public.record_stock_exit(v_product.id, 8, 'perte', null);
  exception when others then
    v_raised := true;
    v_msg := SQLERRM;
  end;
  if not v_raised then
    raise exception 'ÉCHEC (#7) : une sortie supérieure au stock aurait dû être refusée.';
  end if;
  if v_msg not like 'Stock insuffisant%' then
    raise exception 'ÉCHEC (#7) : message inattendu « % ».', v_msg;
  end if;

  select quantity into v_qty from public.products where id = v_product.id;
  if v_qty <> 7 then
    raise exception 'ÉCHEC (#7) : le stock a été modifié malgré le refus (obtenu %).', v_qty;
  end if;

  -- ------------------------------------------------------------------
  -- #8 Refus des quantités nulles, négatives ou invalides
  -- ------------------------------------------------------------------
  foreach v_qty in array array[0::numeric, -5::numeric, null::numeric] loop
    v_raised := false;
    begin
      perform public.record_stock_entry(v_product.id, v_qty, 'réception', null);
    exception when others then
      v_raised := true;
    end;
    if not v_raised then
      raise exception 'ÉCHEC (#8) : la quantité % aurait dû être refusée.', coalesce(v_qty, -1);
    end if;
  end loop;

  -- ------------------------------------------------------------------
  -- Stock faible / rupture (statut calculé)
  -- ------------------------------------------------------------------
  select quantity into v_qty from public.products where id = v_product.id;
  if v_qty <> 7 or (select stock_status from public.products where id = v_product.id) <> 'ok' then
    raise exception 'ÉCHEC : statut du stock incorrect pour 7 unités (seuil 3).';
  end if;

  -- ------------------------------------------------------------------
  -- Ajustement autorisé : -2 unités, tracé comme un mouvement
  -- ------------------------------------------------------------------
  v_adjust := public.record_stock_adjustment(v_product.id, -2, 'ajustement autorisé', 'Correction inventaire');
  select quantity into v_qty from public.products where id = v_product.id;
  if v_qty <> 5 then
    raise exception 'ÉCHEC : stock attendu 5 après ajustement, obtenu %.', v_qty;
  end if;
  if v_adjust.type <> 'adjustment' or v_adjust.quantity <> 2 then
    raise exception 'ÉCHEC : l''ajustement n''est pas enregistré correctement.';
  end if;

  -- ------------------------------------------------------------------
  -- #10 Historique : continuité des quantités avant / après
  -- ------------------------------------------------------------------
  select count(*) into v_count from public.stock_movements where product_id = v_product.id;
  if v_count <> 3 then
    raise exception 'ÉCHEC (#10) : 3 mouvements attendus, obtenu %.', v_count;
  end if;

  select count(*) into v_count
  from (
    select quantity_after,
           lead(quantity_before) over (order by created_at, id) as next_before
    from public.stock_movements
    where product_id = v_product.id
  ) chain
  where next_before is not null and next_before <> quantity_after;

  if v_count <> 0 then
    raise exception 'ÉCHEC (#10) : % rupture(s) de continuité dans l''historique.', v_count;
  end if;

  select quantity into v_qty from public.products where id = v_product.id;
  select quantity_after into v_last
  from public.stock_movements
  where product_id = v_product.id
  order by created_at desc, id desc
  limit 1;

  if v_qty <> v_last then
    raise exception 'ÉCHEC (#10) : le stock (%) ne correspond pas au dernier mouvement (%).',
      v_qty, v_last;
  end if;

  -- ------------------------------------------------------------------
  -- #4 Modification des informations sans toucher à la quantité
  -- ------------------------------------------------------------------
  update public.products
  set name = 'Produit test modifié', category = 'Catégorie A', description = 'Nouvelle description'
  where id = v_product.id;

  select quantity into v_qty from public.products where id = v_product.id;
  if v_qty <> 5 then
    raise exception 'ÉCHEC (#4) : la modification a changé la quantité (%).', v_qty;
  end if;

  -- La quantité ne peut jamais être modifiée directement
  v_raised := false;
  begin
    update public.products set quantity = 999 where id = v_product.id;
  exception when others then
    v_raised := true;
    v_msg := SQLERRM;
  end;
  if not v_raised then
    raise exception 'ÉCHEC : la quantité a pu être modifiée directement.';
  end if;
  if v_msg not like 'La quantité ne peut être modifiée%' then
    raise exception 'ÉCHEC : message inattendu « % ».', v_msg;
  end if;

  -- ------------------------------------------------------------------
  -- Instantané du produit figé dans l'historique (#13)
  -- ------------------------------------------------------------------
  if not exists (
    select 1 from public.stock_movements
    where product_id = v_product.id and product_name = 'Produit test'
  ) then
    raise exception 'ÉCHEC (#13) : le nom du produit au moment du mouvement n''est pas conservé.';
  end if;

  -- ------------------------------------------------------------------
  -- Mouvement refusé sur un produit archivé
  -- ------------------------------------------------------------------
  update public.products set is_active = false where id = v_product.id;

  v_raised := false;
  begin
    perform public.record_stock_entry(v_product.id, 1, 'réception', null);
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'ÉCHEC : une entrée a été acceptée sur un produit archivé.';
  end if;

  -- ------------------------------------------------------------------
  -- #13 L'historique reste consultable après archivage
  -- ------------------------------------------------------------------
  select count(*) into v_count from public.stock_movements where product_id = v_product.id;
  if v_count <> 3 then
    raise exception 'ÉCHEC (#13) : l''historique n''est plus complet après archivage (%).', v_count;
  end if;

  -- ------------------------------------------------------------------
  -- #12 Un utilisateur ne peut pas toucher au produit d'un autre
  -- ------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated', 'email', 'stock-test-b@example.com')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', v_other::text, true);

  v_raised := false;
  begin
    perform public.record_stock_entry(v_product.id, 1, 'réception', null);
  exception when others then
    v_raised := true;
    v_msg := SQLERRM;
  end;
  if not v_raised then
    raise exception 'ÉCHEC (#12) : un autre utilisateur a modifié le stock.';
  end if;
  if v_msg <> 'Produit introuvable.' then
    raise exception 'ÉCHEC (#12) : message inattendu « % ».', v_msg;
  end if;

  -- ------------------------------------------------------------------
  -- #12 Isolation des lectures et des écritures via RLS
  -- ------------------------------------------------------------------
  insert into public.products (user_id, reference, name, unit)
  values (v_other, 'TST-AUTRE', 'Produit de B', 'pièce');

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated', 'email', 'stock-test-a@example.com')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  set local role authenticated;

  select count(*) into v_count from public.products where reference = 'TST-AUTRE';
  if v_count <> 0 then
    raise exception 'ÉCHEC (#12) : un utilisateur voit le produit d''un autre utilisateur.';
  end if;

  v_raised := false;
  begin
    insert into public.products (user_id, reference, name, unit)
    values (v_other, 'TST-FRAUDE', 'Fraude', 'pièce');
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'ÉCHEC (#12) : insertion avec un user_id étranger autorisée.';
  end if;

  reset role;

  raise notice '✔ TOUS LES TESTS SONT PASSÉS (scénarios #1 à #13 hors concurrence).';
end $$;

rollback;
