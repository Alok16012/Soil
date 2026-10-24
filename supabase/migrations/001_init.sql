-- SOIL DMS schema
create extension if not exists pgcrypto;

-- ─── helpers ─────────────────────────────────────────────────
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ─── locations ───────────────────────────────────────────────
create table public.states (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text,
  gst_state_code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.districts (
  id uuid primary key default gen_random_uuid(),
  state_id uuid not null references public.states(id) on delete restrict,
  name text not null,
  code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (state_id, name)
);

create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  district_id uuid not null references public.districts(id) on delete restrict,
  name text not null,
  code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.gram_panchayats (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.blocks(id) on delete restrict,
  name text not null,
  code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.villages (
  id uuid primary key default gen_random_uuid(),
  gram_panchayat_id uuid not null references public.gram_panchayats(id) on delete restrict,
  name text not null,
  code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── users (profile for auth.users) ──────────────────────────
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  first_name text not null,
  last_name text,
  phone text,
  role text not null default 'marketing_executive' check (role in
    ('super_admin','state_admin','district_admin','block_admin','marketing_executive','accountant','retailer')),
  state_id uuid references public.states(id) on delete set null,
  district_id uuid references public.districts(id) on delete set null,
  block_id uuid references public.blocks(id) on delete set null,
  is_active boolean not null default true,
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.marketing_executives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  state_id uuid references public.states(id) on delete set null,
  district_id uuid references public.districts(id) on delete set null,
  block_id uuid references public.blocks(id) on delete set null,
  employee_id text,
  joining_date date,
  target_amount numeric(14,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sales_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  period_month int not null default 0,
  period_year int not null default 0,
  target_amount numeric(14,2) not null default 0,
  achieved_amount numeric(14,2) not null default 0,
  status text,
  notes text,
  incentive_slab jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── catalogue ───────────────────────────────────────────────
create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence public.product_code_seq;
create table public.products (
  id uuid primary key default gen_random_uuid(),
  product_code text not null unique default ('PRD-' || lpad(nextval('public.product_code_seq')::text, 4, '0')),
  name text not null,
  description text,
  hsn_code text,
  unit text default 'KG',
  pack_size text,
  gst_rate numeric(5,2) not null default 0,
  mrp numeric(12,2),
  price_cnf numeric(12,2),
  price_dd numeric(12,2),
  price_btd numeric(12,2),
  price_ksk numeric(12,2),
  price_farmer numeric(12,2),
  category_id uuid references public.product_categories(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inventory (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null unique references public.products(id) on delete cascade,
  quantity int not null default 0 check (quantity >= 0),
  reorder_level int not null default 10,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.create_inventory_for_product() returns trigger language plpgsql as $$
begin
  insert into public.inventory (product_id) values (new.id) on conflict (product_id) do nothing;
  return new;
end $$;
create trigger products_create_inventory after insert on public.products
  for each row execute function public.create_inventory_for_product();

-- ─── customers ───────────────────────────────────────────────
create sequence public.customer_code_seq;
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  customer_code text not null unique default ('CUST-' || lpad(nextval('public.customer_code_seq')::text, 4, '0')),
  name text not null,
  phone text,
  email text,
  address text,
  gst_number text,
  credit_limit numeric(14,2) not null default 0,
  state_id uuid references public.states(id) on delete set null,
  district_id uuid references public.districts(id) on delete set null,
  block_id uuid references public.blocks(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── orders ──────────────────────────────────────────────────
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid references public.customers(id) on delete restrict,
  order_status text not null default 'pending' check (order_status in ('pending','confirmed','dispatched','delivered','cancelled')),
  order_date date not null default current_date,
  subtotal numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete restrict,
  quantity numeric(12,2) not null default 1,
  unit_rate numeric(12,2) not null default 0,
  tax_rate numeric(5,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

-- ─── invoices ────────────────────────────────────────────────
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  order_id uuid references public.orders(id) on delete set null,
  customer_id uuid references public.customers(id) on delete restrict,
  invoice_date date not null default current_date,
  due_date date,
  subtotal numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  cgst_amount numeric(14,2) not null default 0,
  sgst_amount numeric(14,2) not null default 0,
  igst_amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  paid_amount numeric(14,2) not null default 0,
  payment_status text not null default 'pending' check (payment_status in ('pending','unpaid','partial','paid')),
  notes text,
  state_id uuid references public.states(id) on delete set null,
  district_id uuid references public.districts(id) on delete set null,
  block_id uuid references public.blocks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  hsn_code text,
  unit text,
  quantity numeric(12,2) not null default 1,
  rate numeric(12,2) not null default 0,
  tax_rate numeric(5,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

-- ─── payments ────────────────────────────────────────────────
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  payment_number text not null unique,
  invoice_id uuid references public.invoices(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  amount numeric(14,2) not null check (amount > 0),
  payment_mode text not null default 'cash',
  payment_date date not null default current_date,
  reference_number text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep invoices.paid_amount / payment_status in sync with payments
create or replace function public.sync_invoice_paid() returns trigger language plpgsql as $$
declare inv uuid;
begin
  for inv in select distinct x from unnest(array[
    case when tg_op <> 'INSERT' then old.invoice_id end,
    case when tg_op <> 'DELETE' then new.invoice_id end]) as x where x is not null
  loop
    update public.invoices i set
      paid_amount = p.total,
      payment_status = case when p.total <= 0 then 'pending'
                            when p.total + 0.5 >= i.total_amount then 'paid'
                            else 'partial' end
    from (select coalesce(sum(amount), 0) as total from public.payments where invoice_id = inv) p
    where i.id = inv;
  end loop;
  return null;
end $$;
create trigger payments_sync_invoice after insert or update or delete on public.payments
  for each row execute function public.sync_invoice_paid();

-- ─── updated_at triggers ─────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['states','districts','blocks','gram_panchayats','villages','users','marketing_executives',
    'sales_targets','product_categories','products','inventory','customers','orders','invoices','payments']
  loop
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ─── indexes ─────────────────────────────────────────────────
create index on public.districts (state_id);
create index on public.blocks (district_id);
create index on public.gram_panchayats (block_id);
create index on public.villages (gram_panchayat_id);
create index on public.order_items (order_id);
create index on public.invoice_items (invoice_id);
create index on public.invoices (order_id);
create index on public.invoices (customer_id);
create index on public.payments (invoice_id);
create index on public.orders (customer_id);
create index on public.sales_targets (user_id);
create index on public.marketing_executives (user_id);

-- ─── row level security ──────────────────────────────────────
-- Writes go through the Netlify function (service role, role-checked).
-- Logged-in, active users may read directly with the anon key.
create or replace function public.is_active_user() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and is_active)
$$;

do $$
declare t text;
begin
  foreach t in array array['states','districts','blocks','gram_panchayats','villages','marketing_executives',
    'sales_targets','product_categories','products','inventory','customers','orders','order_items','invoices',
    'invoice_items','payments']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "active users read" on public.%I for select to authenticated using (public.is_active_user())', t);
  end loop;
end $$;

alter table public.users enable row level security;
create policy "read own profile" on public.users for select to authenticated using (id = auth.uid());
create policy "active users read profiles" on public.users for select to authenticated using (public.is_active_user());

-- ─── storage ─────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('executive-photos', 'executive-photos', true)
  on conflict (id) do nothing;
