
create extension if not exists pgcrypto with schema extensions;

create type public.app_role as enum ('owner','shop');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
create or replace function public.is_shop()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid())
$$;
create policy "own roles" on public.user_roles for select to authenticated using (user_id = auth.uid());

-- first account becomes owner; later accounts get no access until the owner grants it
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.user_roles where role = 'owner') then
    insert into public.user_roles(user_id, role) values (new.id, 'owner');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- SETTINGS
create table public.shop_settings (
  id int primary key default 1 check (id = 1),
  shop_name text not null default 'Anouk Fashion',
  address text not null default 'Lorentsplein 14',
  postal_city text not null default '2522 EB Den Haag',
  logo_data_url text,
  thank_you_text text not null default 'Bedankt voor uw aankoop bij Anouk Fashion. Veel plezier met uw nieuwe outfit en graag tot ziens!',
  return_text text not null default 'Geen retour, alleen ruilen binnen 8 dagen op vertoon van de bon.',
  require_pin boolean not null default false,
  printer_type text not null default 'browser',
  printer_connection text not null default 'browser',
  printer_address text,
  paper_width int not null default 80 check (paper_width in (58,80)),
  auto_print boolean not null default false,
  print_copies int not null default 1 check (print_copies between 1 and 5),
  pin_auto_enabled boolean not null default false,
  pin_provider text,
  pin_terminal_id text,
  drawer_auto_open boolean not null default false,
  giftcard_vat_mode text not null default 'unset' check (giftcard_vat_mode in ('unset','multi_purpose','single_purpose')),
  giftcard_validity_months int,
  test_mode boolean not null default false,
  exchange_days int not null default 8,
  updated_at timestamptz not null default now()
);
insert into public.shop_settings(id) values (1);
grant select, update on public.shop_settings to authenticated;
grant all on public.shop_settings to service_role;
alter table public.shop_settings enable row level security;
create policy "shop read settings" on public.shop_settings for select to authenticated using (public.is_shop());
create policy "shop update settings" on public.shop_settings for update to authenticated using (public.is_shop()) with check (public.is_shop());

create table public.registers (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);
insert into public.registers(id, name) values ('01','Kassa 1');
grant select on public.registers to authenticated;
grant all on public.registers to service_role;
alter table public.registers enable row level security;
create policy "shop read registers" on public.registers for select to authenticated using (public.is_shop());

-- EMPLOYEES
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  has_pin boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.employees to authenticated;
grant all on public.employees to service_role;
alter table public.employees enable row level security;
create policy "shop employees" on public.employees for all to authenticated using (public.is_shop()) with check (public.is_shop());

create table public.employee_pins (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  pin_hash text not null,
  failed_attempts int not null default 0,
  locked_until timestamptz
);
grant all on public.employee_pins to service_role;
alter table public.employee_pins enable row level security;

-- CATEGORIES & PRODUCTS
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0,
  track_stock boolean not null default false,
  stock_qty int not null default 0,
  min_stock int,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.categories(name, sort_order) values
 ('Broeken',1),('Truien',2),('Jurken',3),('Blouses',4),('Tops',5),('Rokken',6),('Jassen',7),('Accessoires',8),('Overig',9);
grant select, insert, update on public.categories to authenticated;
grant all on public.categories to service_role;
alter table public.categories enable row level security;
create policy "shop categories" on public.categories for all to authenticated using (public.is_shop()) with check (public.is_shop());

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category_id uuid references public.categories(id),
  barcode text unique,
  size text,
  color text,
  price_cents int not null check (price_cents >= 0),
  cost_cents int check (cost_cents >= 0),
  track_stock boolean not null default true,
  stock_qty int not null default 0,
  min_stock int,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.products to authenticated;
grant all on public.products to service_role;
alter table public.products enable row level security;
create policy "shop products" on public.products for all to authenticated using (public.is_shop()) with check (public.is_shop());

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id),
  category_id uuid references public.categories(id),
  qty_change int not null,
  reason text not null check (reason in ('verkoop','retour','levering','correctie','afgeboekt')),
  note text,
  employee_id uuid references public.employees(id),
  sale_id uuid,
  return_id uuid,
  created_at timestamptz not null default now()
);
grant select, insert on public.stock_movements to authenticated;
grant all on public.stock_movements to service_role;
alter table public.stock_movements enable row level security;
create policy "shop read stock" on public.stock_movements for select to authenticated using (public.is_shop());

-- PROMOTIONS
create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  qty int not null check (qty >= 2),
  price_cents int not null check (price_cents >= 0),
  product_ids uuid[] not null default '{}',
  category_ids uuid[] not null default '{}',
  starts_on date,
  ends_on date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.promotions to authenticated;
grant all on public.promotions to service_role;
alter table public.promotions enable row level security;
create policy "shop promotions" on public.promotions for all to authenticated using (public.is_shop()) with check (public.is_shop());

-- CASH SESSIONS
create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  register_id text not null references public.registers(id),
  status text not null default 'open' check (status in ('open','closed')),
  opened_at timestamptz not null default now(),
  opened_by uuid references public.employees(id),
  start_cents int not null check (start_cents >= 0),
  closed_at timestamptz,
  closed_by uuid references public.employees(id),
  expected_cents int,
  counted_cents int,
  difference_cents int,
  denominations jsonb,
  close_note text,
  provisional boolean not null default false,
  summary jsonb
);
create unique index one_open_session_per_register on public.cash_sessions(register_id) where status = 'open';
grant select on public.cash_sessions to authenticated;
grant all on public.cash_sessions to service_role;
alter table public.cash_sessions enable row level security;
create policy "shop sessions" on public.cash_sessions for select to authenticated using (public.is_shop());

create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  cash_session_id uuid not null references public.cash_sessions(id),
  kind text not null check (kind in ('inleg','uitgave','kasuitname','correctie')),
  amount_cents int not null check (amount_cents > 0),
  reason text not null,
  employee_id uuid references public.employees(id),
  created_at timestamptz not null default now()
);
grant select on public.cash_movements to authenticated;
grant all on public.cash_movements to service_role;
alter table public.cash_movements enable row level security;
create policy "shop cash moves" on public.cash_movements for select to authenticated using (public.is_shop());

-- SALES
create table public.sales (
  id uuid primary key,
  receipt_number text not null unique,
  register_id text not null references public.registers(id),
  cash_session_id uuid references public.cash_sessions(id),
  employee_id uuid references public.employees(id),
  created_at timestamptz not null,
  synced_at timestamptz not null default now(),
  total_cents int not null,
  goods_cents int not null,
  giftcard_issue_cents int not null default 0,
  discount_cents int not null default 0,
  vat_cents int not null default 0,
  is_test boolean not null default false,
  offline boolean not null default false,
  exchange_return_id uuid,
  snapshot jsonb not null
);
create index sales_created_idx on public.sales(created_at);
grant select on public.sales to authenticated;
grant all on public.sales to service_role;
alter table public.sales enable row level security;
create policy "shop sales" on public.sales for select to authenticated using (public.is_shop());

create table public.sale_lines (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id),
  line_no int not null,
  kind text not null check (kind in ('product','loose','giftcard')),
  product_id uuid references public.products(id),
  category_id uuid references public.categories(id),
  description text not null,
  size text,
  color text,
  qty int not null check (qty > 0),
  unit_price_cents int not null,
  original_cents int not null,
  discount_cents int not null default 0,
  final_cents int not null check (final_cents >= 0),
  discount_note text,
  promotion_id uuid,
  price_overridden boolean not null default false,
  stock_mode text not null default 'none' check (stock_mode in ('detailed','category','none')),
  cost_cents int,
  oversold boolean not null default false,
  gift_card_id uuid,
  returned_qty int not null default 0,
  refunded_cents int not null default 0
);
create index sale_lines_sale_idx on public.sale_lines(sale_id);
grant select on public.sale_lines to authenticated;
grant all on public.sale_lines to service_role;
alter table public.sale_lines enable row level security;
create policy "shop sale lines" on public.sale_lines for select to authenticated using (public.is_shop());

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id),
  method text not null check (method in ('cash','pin','giftcard','exchange_credit')),
  amount_cents int not null check (amount_cents > 0),
  tendered_cents int,
  change_cents int,
  manual_confirmed boolean not null default true,
  gift_card_id uuid,
  provider_reference text,
  created_at timestamptz not null default now()
);
create index payments_sale_idx on public.payments(sale_id);
grant select on public.payments to authenticated;
grant all on public.payments to service_role;
alter table public.payments enable row level security;
create policy "shop payments" on public.payments for select to authenticated using (public.is_shop());

-- terminal / partial payment attempts (recoverable flow)
create table public.payment_attempts (
  id uuid primary key,
  cart_ref text not null,
  method text not null,
  amount_cents int not null,
  status text not null check (status in ('wachten','geslaagd','geweigerd','geannuleerd','timeout','onbekend','teruggeboekt','verwerkt')),
  provider_reference text,
  employee_id uuid references public.employees(id),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.payment_attempts to authenticated;
grant all on public.payment_attempts to service_role;
alter table public.payment_attempts enable row level security;
create policy "shop attempts" on public.payment_attempts for all to authenticated using (public.is_shop()) with check (public.is_shop());

-- GIFT CARDS
create table public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  initial_cents int not null check (initial_cents > 0),
  balance_cents int not null check (balance_cents >= 0),
  status text not null default 'active' check (status in ('active','blocked')),
  issued_sale_id uuid references public.sales(id),
  created_at timestamptz not null default now()
);
grant select on public.gift_cards to authenticated;
grant all on public.gift_cards to service_role;
alter table public.gift_cards enable row level security;
create policy "shop giftcards" on public.gift_cards for select to authenticated using (public.is_shop());

create table public.gift_card_transactions (
  id uuid primary key default gen_random_uuid(),
  gift_card_id uuid not null references public.gift_cards(id),
  kind text not null check (kind in ('uitgifte','besteding','correctie')),
  amount_cents int not null,
  balance_after_cents int not null,
  sale_id uuid,
  employee_id uuid,
  created_at timestamptz not null default now()
);
grant select on public.gift_card_transactions to authenticated;
grant all on public.gift_card_transactions to service_role;
alter table public.gift_card_transactions enable row level security;
create policy "shop gc tx" on public.gift_card_transactions for select to authenticated using (public.is_shop());

-- RETURNS
create table public.returns (
  id uuid primary key,
  original_sale_id uuid references public.sales(id),
  kind text not null check (kind in ('retour','ruil')),
  no_receipt boolean not null default false,
  reason text not null,
  exception_note text,
  outside_window boolean not null default false,
  employee_id uuid references public.employees(id),
  cash_session_id uuid references public.cash_sessions(id),
  refund_total_cents int not null,
  credit_used_cents int not null default 0,
  refund_paid_cents int not null default 0,
  refund_method text check (refund_method in ('cash','pin','none')),
  exchange_sale_id uuid,
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);
grant select on public.returns to authenticated;
grant all on public.returns to service_role;
alter table public.returns enable row level security;
create policy "shop returns" on public.returns for select to authenticated using (public.is_shop());

create table public.return_lines (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.returns(id),
  sale_line_id uuid references public.sale_lines(id),
  product_id uuid references public.products(id),
  category_id uuid references public.categories(id),
  description text not null,
  qty int not null check (qty > 0),
  amount_cents int not null check (amount_cents >= 0),
  restock boolean not null default true,
  stock_mode text not null default 'none'
);
grant select on public.return_lines to authenticated;
grant all on public.return_lines to service_role;
alter table public.return_lines enable row level security;
create policy "shop return lines" on public.return_lines for select to authenticated using (public.is_shop());

-- PARKED CARTS
create table public.parked_carts (
  id uuid primary key default gen_random_uuid(),
  label text,
  employee_id uuid references public.employees(id),
  cart jsonb not null,
  created_at timestamptz not null default now()
);
grant select, insert, delete on public.parked_carts to authenticated;
grant all on public.parked_carts to service_role;
alter table public.parked_carts enable row level security;
create policy "shop parked" on public.parked_carts for all to authenticated using (public.is_shop()) with check (public.is_shop());

-- AUDIT
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  employee_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);
grant select, insert on public.audit_log to authenticated;
grant all on public.audit_log to service_role;
alter table public.audit_log enable row level security;
create policy "shop audit read" on public.audit_log for select to authenticated using (public.is_shop());
create policy "shop audit insert" on public.audit_log for insert to authenticated with check (public.is_shop());

-- ============ FUNCTIONS ============

create or replace function public.require_shop() returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_shop() then raise exception 'Geen toegang' using errcode = '42501'; end if;
end $$;

create or replace function public.require_owner() returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'owner') then raise exception 'Alleen de eigenaar mag dit' using errcode = '42501'; end if;
end $$;

create or replace function public.set_employee_pin(_employee_id uuid, _pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.require_shop();
  if _pin is null or _pin = '' then
    delete from public.employee_pins where employee_id = _employee_id;
    update public.employees set has_pin = false where id = _employee_id;
  else
    if _pin !~ '^[0-9]{4,8}$' then raise exception 'Pincode moet 4 tot 8 cijfers zijn'; end if;
    insert into public.employee_pins(employee_id, pin_hash) values (_employee_id, extensions.crypt(_pin, extensions.gen_salt('bf')))
      on conflict (employee_id) do update set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null;
    update public.employees set has_pin = true where id = _employee_id;
  end if;
  insert into public.audit_log(action, employee_id, details) values ('pincode_gewijzigd', _employee_id, null);
end $$;

create or replace function public.verify_employee_pin(_employee_id uuid, _pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r public.employee_pins;
begin
  perform public.require_shop();
  select * into r from public.employee_pins where employee_id = _employee_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Geen pincode ingesteld'); end if;
  if r.locked_until is not null and r.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'Te veel pogingen. Probeer het over enkele minuten opnieuw.');
  end if;
  if r.pin_hash = extensions.crypt(_pin, r.pin_hash) then
    update public.employee_pins set failed_attempts = 0, locked_until = null where employee_id = _employee_id;
    return jsonb_build_object('ok', true);
  end if;
  update public.employee_pins set failed_attempts = failed_attempts + 1,
    locked_until = case when failed_attempts + 1 >= 5 then now() + interval '5 minutes' else null end
    where employee_id = _employee_id;
  insert into public.audit_log(action, employee_id, details) values ('pincode_mislukt', _employee_id, null);
  return jsonb_build_object('ok', false, 'error', 'Onjuiste pincode');
end $$;

create or replace function public.adjust_stock(_product_id uuid, _category_id uuid, _qty int, _reason text, _note text, _employee_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_shop();
  if _qty = 0 then raise exception 'Aantal mag niet 0 zijn'; end if;
  if _reason not in ('levering','correctie','afgeboekt') then raise exception 'Ongeldige reden'; end if;
  if _product_id is not null then
    update public.products set stock_qty = stock_qty + _qty, updated_at = now() where id = _product_id;
  elsif _category_id is not null then
    update public.categories set stock_qty = stock_qty + _qty where id = _category_id;
  else raise exception 'Product of categorie vereist'; end if;
  insert into public.stock_movements(product_id, category_id, qty_change, reason, note, employee_id)
    values (_product_id, case when _product_id is null then _category_id end, _qty, _reason, _note, _employee_id);
end $$;

create or replace function public.open_cash_session(_register_id text, _employee_id uuid, _start_cents int)
returns uuid language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  perform public.require_shop();
  if _start_cents < 0 then raise exception 'Startgeld ongeldig'; end if;
  if exists (select 1 from public.cash_sessions where register_id = _register_id and status = 'open') then
    raise exception 'Er is al een open kassasessie';
  end if;
  insert into public.cash_sessions(register_id, opened_by, start_cents) values (_register_id, _employee_id, _start_cents) returning id into sid;
  insert into public.audit_log(action, employee_id, details) values ('kassa_geopend', _employee_id, jsonb_build_object('session', sid, 'start', _start_cents));
  return sid;
end $$;

create or replace function public.add_cash_movement(_session_id uuid, _kind text, _amount_cents int, _reason text, _employee_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_shop();
  if not exists (select 1 from public.cash_sessions where id = _session_id and status = 'open') then raise exception 'Kassasessie is niet open'; end if;
  if coalesce(trim(_reason),'') = '' then raise exception 'Reden is verplicht'; end if;
  insert into public.cash_movements(cash_session_id, kind, amount_cents, reason, employee_id) values (_session_id, _kind, _amount_cents, _reason, _employee_id);
  insert into public.audit_log(action, employee_id, details) values ('kasmutatie', _employee_id, jsonb_build_object('kind', _kind, 'amount', _amount_cents, 'reason', _reason));
end $$;

create or replace function public.cash_session_expected(_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s public.cash_sessions; cash_sales int; cash_refunds int; inleg int; uitgave int; uitname int; correctie int; pin_total int; gc_total int;
begin
  perform public.require_shop();
  select * into s from public.cash_sessions where id = _session_id;
  select coalesce(sum(p.amount_cents),0) into cash_sales from public.payments p join public.sales sa on sa.id = p.sale_id
    where sa.cash_session_id = _session_id and p.method = 'cash' and not sa.is_test;
  select coalesce(sum(p.amount_cents),0) into pin_total from public.payments p join public.sales sa on sa.id = p.sale_id
    where sa.cash_session_id = _session_id and p.method = 'pin' and not sa.is_test;
  select coalesce(sum(p.amount_cents),0) into gc_total from public.payments p join public.sales sa on sa.id = p.sale_id
    where sa.cash_session_id = _session_id and p.method = 'giftcard' and not sa.is_test;
  select coalesce(sum(refund_paid_cents),0) into cash_refunds from public.returns where cash_session_id = _session_id and refund_method = 'cash' and not is_test;
  select coalesce(sum(amount_cents) filter (where kind='inleg'),0), coalesce(sum(amount_cents) filter (where kind='uitgave'),0),
         coalesce(sum(amount_cents) filter (where kind='kasuitname'),0), coalesce(sum(amount_cents) filter (where kind='correctie'),0)
    into inleg, uitgave, uitname, correctie from public.cash_movements where cash_session_id = _session_id;
  return jsonb_build_object('start', s.start_cents, 'cash_sales', cash_sales, 'inleg', inleg, 'cash_refunds', cash_refunds,
    'uitgave', uitgave, 'kasuitname', uitname, 'pin', pin_total, 'giftcard', gc_total,
    'expected', s.start_cents + cash_sales + inleg - cash_refunds - uitgave - uitname);
end $$;

create or replace function public.close_cash_session(_session_id uuid, _employee_id uuid, _counted_cents int, _denominations jsonb, _note text, _provisional boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare summ jsonb; exp int; diff int;
begin
  perform public.require_shop();
  perform 1 from public.cash_sessions where id = _session_id and status = 'open' for update;
  if not found then raise exception 'Kassasessie is niet open'; end if;
  if exists (select 1 from public.payment_attempts where status in ('wachten','onbekend','timeout','geslaagd')) then
    raise exception 'Er zijn nog onvoltooide betalingen. Los deze eerst op.';
  end if;
  summ := public.cash_session_expected(_session_id);
  exp := (summ->>'expected')::int;
  diff := _counted_cents - exp;
  if diff <> 0 and coalesce(trim(_note),'') = '' then raise exception 'Toelichting verplicht bij kasverschil'; end if;
  update public.cash_sessions set status = 'closed', closed_at = now(), closed_by = _employee_id, expected_cents = exp,
    counted_cents = _counted_cents, difference_cents = diff, denominations = _denominations, close_note = _note,
    provisional = coalesce(_provisional,false), summary = summ where id = _session_id;
  insert into public.audit_log(action, employee_id, details) values ('dagafsluiting', _employee_id, jsonb_build_object('session', _session_id, 'expected', exp, 'counted', _counted_cents, 'diff', diff));
  return summ || jsonb_build_object('counted', _counted_cents, 'difference', diff);
end $$;

-- CORE: complete a sale atomically and idempotently
create or replace function public.complete_sale(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  sid uuid := (p->>'id')::uuid;
  existing public.sales;
  ln jsonb; pm jsonb;
  i int := 0;
  total int := 0; goods int := 0; gc_issue int := 0; disc int := 0; vat int := 0;
  paid int := 0;
  l_qty int; l_orig int; l_disc int; l_final int;
  gc public.gift_cards;
  new_gc uuid; line_id uuid;
  credit_avail int;
  sess_ok boolean;
  is_test boolean := coalesce((p->>'is_test')::boolean, false);
begin
  perform public.require_shop();
  select * into existing from public.sales where id = sid;
  if found then return jsonb_build_object('id', existing.id, 'receipt_number', existing.receipt_number, 'duplicate', true); end if;
  if (p->>'receipt_number') !~ '^[0-9]{8,20}$' then raise exception 'Ongeldig bonnummer'; end if;

  select exists(select 1 from public.cash_sessions where id = (p->>'cash_session_id')::uuid
     and (status = 'open' or coalesce((p->>'offline')::boolean,false))) into sess_ok;
  if not sess_ok then raise exception 'Geen geopende kassasessie'; end if;

  if jsonb_array_length(coalesce(p->'lines','[]'::jsonb)) = 0 then raise exception 'Lege verkoop'; end if;

  for ln in select * from jsonb_array_elements(p->'lines') loop
    l_qty := (ln->>'qty')::int; l_orig := (ln->>'original_cents')::int; l_disc := coalesce((ln->>'discount_cents')::int,0); l_final := (ln->>'final_cents')::int;
    if l_qty is null or l_qty <= 0 then raise exception 'Ongeldig aantal'; end if;
    if l_orig < 0 or l_final < 0 or l_disc < 0 then raise exception 'Ongeldig bedrag'; end if;
    if l_orig - l_disc <> l_final then raise exception 'Kortingsberekening klopt niet'; end if;
    if l_orig <> l_qty * (ln->>'unit_price_cents')::int then raise exception 'Regelbedrag klopt niet'; end if;
    total := total + l_final; disc := disc + l_disc;
    if ln->>'kind' = 'giftcard' then
      if l_final <= 0 or l_disc <> 0 or l_qty <> 1 then raise exception 'Ongeldige cadeaubon'; end if;
      gc_issue := gc_issue + l_final;
    else goods := goods + l_final; end if;
  end loop;
  vat := round(goods * 21.0 / 121.0);

  -- payments validation
  for pm in select * from jsonb_array_elements(coalesce(p->'payments','[]'::jsonb)) loop
    if (pm->>'amount_cents')::int <= 0 then raise exception 'Ongeldige betaling'; end if;
    if pm->>'method' = 'cash' then
      if coalesce((pm->>'tendered_cents')::int,0) - coalesce((pm->>'change_cents')::int,0) <> (pm->>'amount_cents')::int
         or coalesce((pm->>'change_cents')::int,0) < 0 then raise exception 'Contant/wisselgeld klopt niet'; end if;
    elsif pm->>'method' = 'giftcard' and gc_issue > 0 and false then null;
    elsif pm->>'method' not in ('pin','giftcard','exchange_credit') then raise exception 'Onbekende betaalwijze'; end if;
    paid := paid + (pm->>'amount_cents')::int;
  end loop;
  if paid <> total then raise exception 'Betaald bedrag (%) wijkt af van totaal (%)', paid, total; end if;

  insert into public.sales(id, receipt_number, register_id, cash_session_id, employee_id, created_at, total_cents, goods_cents,
     giftcard_issue_cents, discount_cents, vat_cents, is_test, offline, exchange_return_id, snapshot)
  values (sid, p->>'receipt_number', coalesce(p->>'register_id','01'), (p->>'cash_session_id')::uuid, (p->>'employee_id')::uuid,
     coalesce((p->>'created_at')::timestamptz, now()), total, goods, gc_issue, disc, vat, is_test,
     coalesce((p->>'offline')::boolean,false), (p->>'exchange_return_id')::uuid, coalesce(p->'snapshot','{}'::jsonb));

  for pm in select * from jsonb_array_elements(coalesce(p->'payments','[]'::jsonb)) loop
    if pm->>'method' = 'giftcard' then
      if gc_issue > 0 then raise exception 'Een cadeaubon kan niet met een cadeaubon betaald worden'; end if;
      select * into gc from public.gift_cards where code = pm->>'gift_card_code' for update;
      if not found then raise exception 'Cadeaubon niet gevonden'; end if;
      if gc.status <> 'active' then raise exception 'Cadeaubon is geblokkeerd'; end if;
      if gc.balance_cents < (pm->>'amount_cents')::int then raise exception 'Onvoldoende saldo op cadeaubon (saldo %)', gc.balance_cents; end if;
      update public.gift_cards set balance_cents = balance_cents - (pm->>'amount_cents')::int where id = gc.id;
      insert into public.gift_card_transactions(gift_card_id, kind, amount_cents, balance_after_cents, sale_id, employee_id)
        values (gc.id, 'besteding', -(pm->>'amount_cents')::int, gc.balance_cents - (pm->>'amount_cents')::int, sid, (p->>'employee_id')::uuid);
      insert into public.payments(sale_id, method, amount_cents, gift_card_id) values (sid, 'giftcard', (pm->>'amount_cents')::int, gc.id);
    elsif pm->>'method' = 'exchange_credit' then
      select r.refund_total_cents - r.credit_used_cents into credit_avail from public.returns r where r.id = (p->>'exchange_return_id')::uuid for update;
      if credit_avail is null or credit_avail < (pm->>'amount_cents')::int then raise exception 'Ruiltegoed ongeldig'; end if;
      update public.returns set credit_used_cents = credit_used_cents + (pm->>'amount_cents')::int, exchange_sale_id = sid where id = (p->>'exchange_return_id')::uuid;
      insert into public.payments(sale_id, method, amount_cents) values (sid, 'exchange_credit', (pm->>'amount_cents')::int);
    else
      insert into public.payments(sale_id, method, amount_cents, tendered_cents, change_cents, manual_confirmed, provider_reference)
        values (sid, pm->>'method', (pm->>'amount_cents')::int, (pm->>'tendered_cents')::int, (pm->>'change_cents')::int,
                coalesce((pm->>'manual')::boolean, true), pm->>'reference');
    end if;
  end loop;

  for ln in select * from jsonb_array_elements(p->'lines') loop
    i := i + 1; new_gc := null;
    if ln->>'kind' = 'giftcard' then
      if (ln->>'gift_card_code') !~ '^[0-9]{12,16}$' then raise exception 'Ongeldige cadeauboncode'; end if;
      insert into public.gift_cards(code, initial_cents, balance_cents, issued_sale_id)
        values (ln->>'gift_card_code', (ln->>'final_cents')::int, (ln->>'final_cents')::int, sid) returning id into new_gc;
      insert into public.gift_card_transactions(gift_card_id, kind, amount_cents, balance_after_cents, sale_id, employee_id)
        values (new_gc, 'uitgifte', (ln->>'final_cents')::int, (ln->>'final_cents')::int, sid, (p->>'employee_id')::uuid);
    end if;
    insert into public.sale_lines(sale_id, line_no, kind, product_id, category_id, description, size, color, qty, unit_price_cents,
      original_cents, discount_cents, final_cents, discount_note, promotion_id, price_overridden, stock_mode, cost_cents, oversold, gift_card_id)
    values (sid, i, ln->>'kind', (ln->>'product_id')::uuid, (ln->>'category_id')::uuid, ln->>'description', ln->>'size', ln->>'color',
      (ln->>'qty')::int, (ln->>'unit_price_cents')::int, (ln->>'original_cents')::int, coalesce((ln->>'discount_cents')::int,0),
      (ln->>'final_cents')::int, ln->>'discount_note', (ln->>'promotion_id')::uuid, coalesce((ln->>'price_overridden')::boolean,false),
      coalesce(ln->>'stock_mode','none'), (ln->>'cost_cents')::int, coalesce((ln->>'oversold')::boolean,false), new_gc)
    returning id into line_id;

    if not is_test then
      if ln->>'stock_mode' = 'detailed' and ln->>'product_id' is not null then
        update public.products set stock_qty = stock_qty - (ln->>'qty')::int, updated_at = now() where id = (ln->>'product_id')::uuid;
        insert into public.stock_movements(product_id, qty_change, reason, employee_id, sale_id, note)
          values ((ln->>'product_id')::uuid, -(ln->>'qty')::int, 'verkoop', (p->>'employee_id')::uuid, sid,
                  case when coalesce((ln->>'oversold')::boolean,false) then 'Verkocht bij ontoereikende voorraad' end);
      elsif ln->>'stock_mode' = 'category' and ln->>'category_id' is not null then
        update public.categories set stock_qty = stock_qty - (ln->>'qty')::int where id = (ln->>'category_id')::uuid;
        insert into public.stock_movements(category_id, qty_change, reason, employee_id, sale_id, note)
          values ((ln->>'category_id')::uuid, -(ln->>'qty')::int, 'verkoop', (p->>'employee_id')::uuid, sid,
                  case when coalesce((ln->>'oversold')::boolean,false) then 'Verkocht bij ontoereikende voorraad' end);
      end if;
    end if;
  end loop;

  if exists (select 1 from jsonb_array_elements(p->'lines') x where coalesce((x->>'oversold')::boolean,false)) then
    insert into public.audit_log(action, employee_id, details) values ('verkoop_onvoldoende_voorraad', (p->>'employee_id')::uuid, jsonb_build_object('sale', sid));
  end if;
  if p ? 'attempt_ids' then
    update public.payment_attempts set status = 'verwerkt', updated_at = now()
      where id in (select (x#>>'{}')::uuid from jsonb_array_elements(p->'attempt_ids') x);
  end if;

  return jsonb_build_object('id', sid, 'receipt_number', p->>'receipt_number', 'duplicate', false);
end $$;

-- RETURNS / EXCHANGES
create or replace function public.process_return(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  rid uuid := (p->>'id')::uuid;
  ln jsonb; sl public.sale_lines; orig public.sales;
  amt int; total int := 0; remaining int;
  no_receipt boolean := coalesce((p->>'no_receipt')::boolean,false);
  outside boolean := false;
  credit int := 0; paid_out int;
  ex jsonb; ex_res jsonb; ex_total int := 0;
  win int;
  is_test boolean := coalesce((p->>'is_test')::boolean,false);
begin
  perform public.require_shop();
  if exists (select 1 from public.returns where id = rid) then
    return jsonb_build_object('id', rid, 'duplicate', true);
  end if;
  if coalesce(trim(p->>'reason'),'') = '' then raise exception 'Reden is verplicht'; end if;
  if not exists (select 1 from public.cash_sessions where id = (p->>'cash_session_id')::uuid and status = 'open') then
    raise exception 'Geen geopende kassasessie';
  end if;
  select exchange_days into win from public.shop_settings where id = 1;

  if not no_receipt then
    select * into orig from public.sales where id = (p->>'original_sale_id')::uuid;
    if not found then raise exception 'Oorspronkelijke verkoop niet gevonden'; end if;
    outside := orig.created_at < now() - make_interval(days => win);
    if outside and coalesce(trim(p->>'exception_note'),'') = '' then
      raise exception 'Buiten % dagen: leg een gemotiveerde uitzondering vast', win;
    end if;
  end if;

  insert into public.returns(id, original_sale_id, kind, no_receipt, reason, exception_note, outside_window, employee_id, cash_session_id,
     refund_total_cents, refund_method, is_test)
  values (rid, case when no_receipt then null else orig.id end, coalesce(p->>'kind','retour'), no_receipt, p->>'reason', p->>'exception_note', outside,
     (p->>'employee_id')::uuid, (p->>'cash_session_id')::uuid, 0, 'none', is_test);

  for ln in select * from jsonb_array_elements(p->'lines') loop
    if (ln->>'qty')::int <= 0 then raise exception 'Ongeldig aantal'; end if;
    if not no_receipt then
      select * into sl from public.sale_lines where id = (ln->>'sale_line_id')::uuid and sale_id = orig.id for update;
      if not found then raise exception 'Regel hoort niet bij deze bon'; end if;
      if sl.kind = 'giftcard' then raise exception 'Cadeaubonnen kunnen niet geretourneerd worden'; end if;
      remaining := sl.qty - sl.returned_qty;
      if (ln->>'qty')::int > remaining then raise exception 'Meer retour dan verkocht voor %', sl.description; end if;
      if (ln->>'qty')::int = remaining then amt := sl.final_cents - sl.refunded_cents;
      else amt := floor(sl.final_cents::numeric * (ln->>'qty')::int / sl.qty); end if;
      update public.sale_lines set returned_qty = returned_qty + (ln->>'qty')::int, refunded_cents = refunded_cents + amt where id = sl.id;
      insert into public.return_lines(return_id, sale_line_id, product_id, category_id, description, qty, amount_cents, restock, stock_mode)
        values (rid, sl.id, sl.product_id, sl.category_id, sl.description, (ln->>'qty')::int, amt, coalesce((ln->>'restock')::boolean,true), sl.stock_mode);
      if not is_test then
        if sl.stock_mode = 'detailed' and sl.product_id is not null then
          if coalesce((ln->>'restock')::boolean,true) then
            update public.products set stock_qty = stock_qty + (ln->>'qty')::int where id = sl.product_id;
            insert into public.stock_movements(product_id, qty_change, reason, employee_id, return_id) values (sl.product_id, (ln->>'qty')::int, 'retour', (p->>'employee_id')::uuid, rid);
          else
            insert into public.stock_movements(product_id, qty_change, reason, employee_id, return_id, note) values (sl.product_id, 0, 'afgeboekt', (p->>'employee_id')::uuid, rid, 'Retour beschadigd, niet terug in voorraad');
          end if;
        elsif sl.stock_mode = 'category' and sl.category_id is not null and coalesce((ln->>'restock')::boolean,true) then
          update public.categories set stock_qty = stock_qty + (ln->>'qty')::int where id = sl.category_id;
          insert into public.stock_movements(category_id, qty_change, reason, employee_id, return_id) values (sl.category_id, (ln->>'qty')::int, 'retour', (p->>'employee_id')::uuid, rid);
        end if;
      end if;
    else
      amt := (ln->>'amount_cents')::int;
      if amt is null or amt < 0 then raise exception 'Ongeldig bedrag'; end if;
      insert into public.return_lines(return_id, category_id, description, qty, amount_cents, restock, stock_mode)
        values (rid, (ln->>'category_id')::uuid, coalesce(ln->>'description','Retour zonder bon'), (ln->>'qty')::int, amt, coalesce((ln->>'restock')::boolean,false), 'none');
    end if;
    total := total + amt;
  end loop;
  update public.returns set refund_total_cents = total where id = rid;

  ex := p->'exchange_sale';
  if ex is not null and jsonb_typeof(ex) = 'object' then
    select coalesce(sum((x->>'final_cents')::int),0) into ex_total from jsonb_array_elements(ex->'lines') x;
    credit := least(total, ex_total);
    -- credit payment is validated inside complete_sale
    ex_res := public.complete_sale(ex || jsonb_build_object('exchange_return_id', rid, 'is_test', is_test));
  end if;
  paid_out := total - credit;
  update public.returns set refund_paid_cents = paid_out,
    refund_method = case when paid_out > 0 then coalesce(p->>'refund_method','cash') else 'none' end where id = rid;
  if paid_out > 0 and coalesce(p->>'refund_method','cash') not in ('cash','pin') then raise exception 'Kies contant of pin voor terugbetaling'; end if;

  insert into public.audit_log(action, employee_id, details) values (case when ex is null then 'retour' else 'ruil' end, (p->>'employee_id')::uuid,
    jsonb_build_object('return', rid, 'total', total, 'no_receipt', no_receipt, 'outside_window', outside, 'reason', p->>'reason'));
  return jsonb_build_object('id', rid, 'refund_total', total, 'credit_used', credit, 'refund_paid', paid_out, 'exchange', ex_res);
end $$;

revoke execute on function public.complete_sale(jsonb) from anon, public;
revoke execute on function public.process_return(jsonb) from anon, public;
grant execute on function public.complete_sale(jsonb) to authenticated;
grant execute on function public.process_return(jsonb) to authenticated;
