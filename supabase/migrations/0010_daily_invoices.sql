-- =====================================================================
-- Migration 0010 : facture journalière récapitulative et clôture du jour
--
-- Prérequis : 0001 -> 0009
-- Aucune table existante n'est recréée et aucune logique de vente, de
-- paiement ou de stock n'est remplacée :
--   * la facture journalière est calculée à la lecture (une seule facture
--     logique par espace et par date : FACT-AAAAMMJJ) ;
--   * la clôture fige explicitement l'état de la journée (instantané et
--     totaux arrêtés) et chaque clôture / réouverture est journalisée ;
--   * une fois la journée clôturée, ses ventes ne peuvent plus être
--     créées, annulées ou modifiées tant qu'elle n'a pas été rouverte.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Informations de l'établissement (une ligne par espace de travail)
-- ---------------------------------------------------------------------
create table if not exists public.establishment_settings (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  name       text not null default '' check (length(name) <= 120),
  address    text check (address is null or length(address) <= 240),
  phone      text check (phone is null or length(phone) <= 60),
  timezone   text not null default 'Indian/Antananarivo',
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null
);

comment on table public.establishment_settings is
  'En-tête des documents imprimés et fuseau horaire de l''établissement.';
comment on column public.establishment_settings.timezone is
  'Fuseau IANA utilisé pour déterminer la journée en cours de l''établissement.';

create or replace function public.establishment_settings_before_write()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.name     := trim(coalesce(new.name, ''));
  new.address  := nullif(trim(coalesce(new.address, '')), '');
  new.phone    := nullif(trim(coalesce(new.phone, '')), '');
  new.timezone := trim(coalesce(new.timezone, ''));

  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'Fuseau horaire inconnu : « % ».', new.timezone;
  end if;

  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists establishment_settings_before_write on public.establishment_settings;
create trigger establishment_settings_before_write
  before insert or update on public.establishment_settings
  for each row execute function public.establishment_settings_before_write();

alter table public.establishment_settings enable row level security;

drop policy if exists "establishment_settings_select_own" on public.establishment_settings;
create policy "establishment_settings_select_own"
  on public.establishment_settings for select
  using (user_id = (select public.current_workspace_id()));

drop policy if exists "establishment_settings_insert_own" on public.establishment_settings;
create policy "establishment_settings_insert_own"
  on public.establishment_settings for insert
  with check (user_id = (select public.current_workspace_id()));

drop policy if exists "establishment_settings_update_own" on public.establishment_settings;
create policy "establishment_settings_update_own"
  on public.establishment_settings for update
  using (user_id = (select public.current_workspace_id()))
  with check (user_id = (select public.current_workspace_id()));

revoke all on table public.establishment_settings from anon;
revoke delete on table public.establishment_settings from authenticated;
grant select, insert, update on table public.establishment_settings to authenticated;

-- Journée en cours selon le fuseau de l'établissement du compte connecté.
create or replace function public.establishment_today()
returns date
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (now() at time zone coalesce(
    (select es.timezone from public.establishment_settings es
     where es.user_id = public.current_workspace_id()),
    'Indian/Antananarivo'
  ))::date;
$$;

revoke all on function public.establishment_today() from public, anon;
grant execute on function public.establishment_today() to authenticated;


-- ---------------------------------------------------------------------
-- Clôtures journalières : une ligne par espace et par date
-- ---------------------------------------------------------------------
create table if not exists public.daily_invoices (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  invoice_date    date not null,
  invoice_number  text not null,
  status          text not null check (status in ('closed', 'reopened')),
  revision        integer not null default 1 check (revision > 0),
  snapshot        jsonb not null,
  clients_count   integer not null default 0,
  sales_count     integer not null default 0,
  items_quantity  numeric not null default 0,
  gross_amount    numeric(16, 2) not null default 0,
  discount_amount numeric(16, 2) not null default 0,
  net_amount      numeric(16, 2) not null default 0,
  paid_amount     numeric(16, 2) not null default 0,
  balance_due     numeric(16, 2) not null default 0,
  closed_at       timestamptz not null default now(),
  closed_by       uuid references auth.users (id) on delete set null,
  close_comment   text,
  reopened_at     timestamptz,
  reopened_by     uuid references auth.users (id) on delete set null,
  reopen_reason   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint daily_invoices_one_per_day unique (user_id, invoice_date),
  constraint daily_invoices_number_unique unique (user_id, invoice_number),
  constraint daily_invoices_number_matches check (invoice_number = 'FACT-' || to_char(invoice_date, 'YYYYMMDD'))
);

comment on table public.daily_invoices is
  'Clôture explicite d''une journée : instantané figé de la facture journalière récapitulative.';

create index if not exists daily_invoices_user_date_idx on public.daily_invoices (user_id, invoice_date desc);

drop trigger if exists daily_invoices_set_updated_at on public.daily_invoices;
create trigger daily_invoices_set_updated_at
  before update on public.daily_invoices
  for each row execute function public.set_updated_at();

-- Journal append-only des clôtures et réouvertures.
create table if not exists public.daily_invoice_events (
  id           bigint generated always as identity primary key,
  invoice_id   uuid not null references public.daily_invoices (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  invoice_date date not null,
  action       text not null check (action in ('closed', 'reopened')),
  revision     integer not null,
  net_amount   numeric(16, 2) not null default 0,
  paid_amount  numeric(16, 2) not null default 0,
  balance_due  numeric(16, 2) not null default 0,
  comment      text,
  created_by   uuid default auth.uid() references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists daily_invoice_events_invoice_idx on public.daily_invoice_events (invoice_id, created_at);

alter table public.daily_invoices       enable row level security;
alter table public.daily_invoice_events enable row level security;

drop policy if exists "daily_invoices_select_own" on public.daily_invoices;
create policy "daily_invoices_select_own"
  on public.daily_invoices for select
  using (user_id = (select public.current_workspace_id()));

drop policy if exists "daily_invoice_events_select_own" on public.daily_invoice_events;
create policy "daily_invoice_events_select_own"
  on public.daily_invoice_events for select
  using (user_id = (select public.current_workspace_id()));

-- Lecture seule : les écritures passent par close / reopen_daily_invoice.
revoke all on table public.daily_invoices       from anon;
revoke all on table public.daily_invoice_events from anon;
revoke insert, update, delete on table public.daily_invoices       from authenticated;
revoke insert, update, delete on table public.daily_invoice_events from authenticated;
grant select on table public.daily_invoices       to authenticated;
grant select on table public.daily_invoice_events to authenticated;


-- ---------------------------------------------------------------------
-- Données de la facture journalière (lecture seule)
--
-- Ventes validées dont la date métier (sale_date) est p_date ; prix et
-- libellés figés de sale_items ; encaissé = paiements validés affectés
-- à chaque vente (vue sale_balances, chaque paiement compté une fois).
-- ---------------------------------------------------------------------
create or replace function public.daily_invoice_data(p_date date)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  with ws as (
    select public.current_workspace_id() as id
  ),
  day_sales as (
    select sb.*
    from public.sale_balances sb
    join ws on sb.user_id = ws.id
    where sb.sale_date = p_date
      and sb.status = 'validated'
  ),
  lines as (
    select
      si.sale_id,
      sum(si.quantity) as quantity,
      jsonb_agg(
        jsonb_build_object(
          'id', si.id,
          'product_id', si.product_id,
          'product_reference', si.product_reference_snapshot,
          'product_name', si.product_name_snapshot,
          'quantity', si.quantity,
          'unit_price', si.unit_price,
          'line_total', si.line_total
        )
        order by si.product_name_snapshot, si.id
      ) as items
    from public.sale_items si
    join day_sales s on s.id = si.sale_id
    group by si.sale_id
  )
  select jsonb_build_object(
    'invoice_date', p_date,
    'invoice_number', 'FACT-' || to_char(p_date, 'YYYYMMDD'),
    'generated_at', now(),
    'sales', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'reference', s.reference,
          'client_id', s.client_id,
          'client_name', coalesce(s.client_name, 'Client supprimé'),
          'client_code', s.client_code,
          'created_at', s.created_at,
          'subtotal', s.subtotal,
          'discount_amount', s.discount_amount,
          'total_amount', s.total_amount,
          'paid_amount', s.paid_amount,
          'balance_due', s.balance_due,
          'payment_status', s.payment_status,
          'items', coalesce(l.items, '[]'::jsonb)
        )
        order by s.created_at, s.reference
      )
      from day_sales s
      left join lines l on l.sale_id = s.id
    ), '[]'::jsonb),
    'cancelled_sales_count', (
      select count(*)
      from public.sales s
      join ws on s.user_id = ws.id
      where s.sale_date = p_date and s.status = 'cancelled'
    ),
    'totals', (
      select jsonb_build_object(
        'clients_count', count(distinct s.client_id),
        'sales_count', count(s.id),
        'items_quantity', coalesce(sum(l.quantity), 0),
        'gross_amount', coalesce(sum(s.subtotal), 0),
        'discount_amount', coalesce(sum(s.discount_amount), 0),
        'net_amount', coalesce(sum(s.total_amount), 0),
        'paid_amount', coalesce(sum(s.paid_amount), 0),
        'balance_due', coalesce(sum(s.balance_due), 0)
      )
      from day_sales s
      left join lines l on l.sale_id = s.id
    )
  );
$$;

revoke all on function public.daily_invoice_data(date) from public, anon;
grant execute on function public.daily_invoice_data(date) to authenticated;


-- Facture du jour + état de clôture et journal, en un seul appel.
create or replace function public.daily_invoice(p_date date)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_ws      uuid := public.current_workspace_id();
  v_closing jsonb;
begin
  if v_ws is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;
  if p_date is null then
    raise exception 'La date de la facture est obligatoire.';
  end if;

  select jsonb_build_object(
    'id', d.id,
    'status', d.status,
    'revision', d.revision,
    'closed_at', d.closed_at,
    'closed_by', d.closed_by,
    'close_comment', d.close_comment,
    'reopened_at', d.reopened_at,
    'reopened_by', d.reopened_by,
    'reopen_reason', d.reopen_reason,
    'snapshot', d.snapshot,
    'events', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'action', e.action,
          'revision', e.revision,
          'net_amount', e.net_amount,
          'paid_amount', e.paid_amount,
          'balance_due', e.balance_due,
          'comment', e.comment,
          'created_by', e.created_by,
          'created_at', e.created_at
        )
        order by e.created_at, e.id
      )
      from public.daily_invoice_events e
      where e.invoice_id = d.id
    ), '[]'::jsonb)
  )
  into v_closing
  from public.daily_invoices d
  where d.user_id = v_ws and d.invoice_date = p_date;

  return public.daily_invoice_data(p_date) || jsonb_build_object(
    'today', public.establishment_today(),
    'can_reopen', auth.uid() = v_ws,
    'closing', v_closing
  );
end;
$$;

revoke all on function public.daily_invoice(date) from public, anon;
grant execute on function public.daily_invoice(date) to authenticated;


-- ---------------------------------------------------------------------
-- Verrou de journée : la clôture (exclusif) attend la fin des ventes en
-- cours sur cette date (partagé), puis lit des données validées.
-- ---------------------------------------------------------------------
create or replace function public.daily_lock_key(p_workspace uuid, p_date date)
returns bigint
language sql
immutable
set search_path = public, pg_temp
as $$
  select hashtextextended('ran-day:' || p_workspace::text || ':' || p_date::text, 0);
$$;

revoke all on function public.daily_lock_key(uuid, date) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- Une journée clôturée n'accepte plus de vente ni de modification de
-- ses ventes (annulation, date, montants). Les paiements restent
-- possibles : ils sont tracés et n'altèrent pas l'instantané figé.
-- ---------------------------------------------------------------------
create or replace function public.guard_closed_sale_day()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dates date[];
  v_date  date;
  v_number text;
begin
  if tg_op = 'INSERT' then
    v_dates := array[new.sale_date];
  elsif new.status is distinct from old.status
     or new.sale_date is distinct from old.sale_date
     or new.client_id is distinct from old.client_id
     or new.subtotal is distinct from old.subtotal
     or new.discount_amount is distinct from old.discount_amount
     or new.total_amount is distinct from old.total_amount then
    v_dates := array[old.sale_date, new.sale_date];
  else
    return new;
  end if;

  foreach v_date in array v_dates loop
    perform pg_advisory_xact_lock_shared(public.daily_lock_key(new.user_id, v_date));

    select d.invoice_number into v_number
    from public.daily_invoices d
    where d.user_id = new.user_id
      and d.invoice_date = v_date
      and d.status = 'closed';

    if found then
      raise exception 'La journée du % est clôturée (facture %). Rouvrez-la avant de modifier ses ventes.',
        to_char(v_date, 'DD/MM/YYYY'), v_number
        using errcode = 'P0001';
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.guard_closed_sale_day() from public, anon, authenticated;

drop trigger if exists sales_guard_closed_day on public.sales;
create trigger sales_guard_closed_day
  before insert or update on public.sales
  for each row execute function public.guard_closed_sale_day();


-- ---------------------------------------------------------------------
-- Clôture explicite d'une journée (fige l'instantané et les totaux)
-- ---------------------------------------------------------------------
create or replace function public.close_daily_invoice(
  p_date    date,
  p_comment text default null
)
returns public.daily_invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_ws      uuid := public.current_workspace_id();
  v_comment text := nullif(trim(coalesce(p_comment, '')), '');
  v_row     public.daily_invoices%rowtype;
  v_exists  boolean;
  v_data    jsonb;
  v_totals  jsonb;
begin
  if v_uid is null or v_ws is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;
  if p_date is null then
    raise exception 'La date de la journée est obligatoire.';
  end if;
  if p_date > public.establishment_today() then
    raise exception 'Impossible de clôturer une journée qui n''a pas encore commencé.';
  end if;
  if v_comment is not null and length(v_comment) > 500 then
    raise exception 'Le commentaire ne doit pas dépasser 500 caractères.';
  end if;

  perform pg_advisory_xact_lock(public.daily_lock_key(v_ws, p_date));

  select * into v_row
  from public.daily_invoices
  where user_id = v_ws and invoice_date = p_date
  for update;
  v_exists := found;

  if v_exists and v_row.status = 'closed' then
    raise exception 'La journée du % est déjà clôturée.', to_char(p_date, 'DD/MM/YYYY');
  end if;

  v_data   := public.daily_invoice_data(p_date);
  v_totals := v_data -> 'totals';

  if coalesce((v_totals ->> 'sales_count')::int, 0) = 0 then
    raise exception 'Aucune vente validée le % : rien à clôturer.', to_char(p_date, 'DD/MM/YYYY');
  end if;

  if v_exists then
    update public.daily_invoices
    set status          = 'closed',
        revision        = revision + 1,
        snapshot        = v_data,
        clients_count   = (v_totals ->> 'clients_count')::int,
        sales_count     = (v_totals ->> 'sales_count')::int,
        items_quantity  = (v_totals ->> 'items_quantity')::numeric,
        gross_amount    = (v_totals ->> 'gross_amount')::numeric,
        discount_amount = (v_totals ->> 'discount_amount')::numeric,
        net_amount      = (v_totals ->> 'net_amount')::numeric,
        paid_amount     = (v_totals ->> 'paid_amount')::numeric,
        balance_due     = (v_totals ->> 'balance_due')::numeric,
        closed_at       = now(),
        closed_by       = v_uid,
        close_comment   = v_comment
    where id = v_row.id
    returning * into v_row;
  else
    insert into public.daily_invoices (
      user_id, invoice_date, invoice_number, status, revision, snapshot,
      clients_count, sales_count, items_quantity, gross_amount, discount_amount,
      net_amount, paid_amount, balance_due, closed_at, closed_by, close_comment
    ) values (
      v_ws, p_date, v_data ->> 'invoice_number', 'closed', 1, v_data,
      (v_totals ->> 'clients_count')::int,
      (v_totals ->> 'sales_count')::int,
      (v_totals ->> 'items_quantity')::numeric,
      (v_totals ->> 'gross_amount')::numeric,
      (v_totals ->> 'discount_amount')::numeric,
      (v_totals ->> 'net_amount')::numeric,
      (v_totals ->> 'paid_amount')::numeric,
      (v_totals ->> 'balance_due')::numeric,
      now(), v_uid, v_comment
    )
    returning * into v_row;
  end if;

  insert into public.daily_invoice_events (
    invoice_id, user_id, invoice_date, action, revision,
    net_amount, paid_amount, balance_due, comment, created_by
  ) values (
    v_row.id, v_ws, p_date, 'closed', v_row.revision,
    v_row.net_amount, v_row.paid_amount, v_row.balance_due, v_comment, v_uid
  );

  return v_row;
end;
$$;

revoke all on function public.close_daily_invoice(date, text) from public, anon;
grant execute on function public.close_daily_invoice(date, text) to authenticated;


-- ---------------------------------------------------------------------
-- Réouverture tracée (propriétaire de l'espace uniquement, motif requis)
-- ---------------------------------------------------------------------
create or replace function public.reopen_daily_invoice(
  p_date   date,
  p_reason text
)
returns public.daily_invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_ws     uuid := public.current_workspace_id();
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_row    public.daily_invoices%rowtype;
begin
  if v_uid is null or v_ws is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;
  if v_uid <> v_ws then
    raise exception 'Seul le propriétaire de l''espace peut rouvrir une journée clôturée.'
      using errcode = '42501';
  end if;
  if p_date is null then
    raise exception 'La date de la journée est obligatoire.';
  end if;
  if v_reason is null or length(v_reason) < 3 then
    raise exception 'Indiquez le motif de la réouverture.';
  end if;
  if length(v_reason) > 500 then
    raise exception 'Le motif ne doit pas dépasser 500 caractères.';
  end if;

  perform pg_advisory_xact_lock(public.daily_lock_key(v_ws, p_date));

  select * into v_row
  from public.daily_invoices
  where user_id = v_ws and invoice_date = p_date
  for update;

  if not found or v_row.status <> 'closed' then
    raise exception 'La journée du % n''est pas clôturée.', to_char(p_date, 'DD/MM/YYYY');
  end if;

  update public.daily_invoices
  set status        = 'reopened',
      reopened_at   = now(),
      reopened_by   = v_uid,
      reopen_reason = v_reason
  where id = v_row.id
  returning * into v_row;

  insert into public.daily_invoice_events (
    invoice_id, user_id, invoice_date, action, revision,
    net_amount, paid_amount, balance_due, comment, created_by
  ) values (
    v_row.id, v_ws, p_date, 'reopened', v_row.revision,
    v_row.net_amount, v_row.paid_amount, v_row.balance_due, v_reason, v_uid
  );

  return v_row;
end;
$$;

revoke all on function public.reopen_daily_invoice(date, text) from public, anon;
grant execute on function public.reopen_daily_invoice(date, text) to authenticated;


notify pgrst, 'reload schema';
