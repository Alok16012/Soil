-- Marketing executives only see data from their own working area.
-- Area = the most specific level assigned on their profile (block, else district, else state).

alter table public.customers add column if not exists created_by uuid references public.users(id) on delete set null;

-- Roles whose reads are limited to their area
create or replace function public.is_area_scoped() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and role in ('marketing_executive'))
$$;

create or replace function public.in_my_area(p_state uuid, p_district uuid, p_block uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when u.role not in ('marketing_executive') then true
      when u.block_id is not null then p_block = u.block_id
      when u.district_id is not null then p_district = u.district_id
      when u.state_id is not null then p_state = u.state_id
      else false
    end
    from public.users u where u.id = auth.uid() and u.is_active
  ), false)
$$;

create or replace function public.can_see_customer(p_customer uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.customers c
    where c.id = p_customer
      and (public.in_my_area(c.state_id, c.district_id, c.block_id) or c.created_by = auth.uid())
  )
$$;

drop policy if exists "active users read" on public.customers;
create policy "area read" on public.customers for select to authenticated
  using (public.is_active_user() and (public.in_my_area(state_id, district_id, block_id) or created_by = auth.uid()));

drop policy if exists "active users read" on public.orders;
create policy "area read" on public.orders for select to authenticated
  using (public.is_active_user() and (not public.is_area_scoped() or created_by = auth.uid() or public.can_see_customer(customer_id)));

drop policy if exists "active users read" on public.order_items;
create policy "area read" on public.order_items for select to authenticated
  using (public.is_active_user() and exists (select 1 from public.orders o where o.id = order_id));

drop policy if exists "active users read" on public.invoices;
create policy "area read" on public.invoices for select to authenticated
  using (public.is_active_user() and (not public.is_area_scoped() or public.can_see_customer(customer_id)
         or public.in_my_area(state_id, district_id, block_id)));

drop policy if exists "active users read" on public.invoice_items;
create policy "area read" on public.invoice_items for select to authenticated
  using (public.is_active_user() and exists (select 1 from public.invoices i where i.id = invoice_id));

drop policy if exists "active users read" on public.payments;
create policy "area read" on public.payments for select to authenticated
  using (public.is_active_user() and (not public.is_area_scoped() or exists (select 1 from public.invoices i where i.id = invoice_id)));

drop policy if exists "active users read profiles" on public.users;
create policy "active users read profiles" on public.users for select to authenticated
  using (public.is_active_user() and not public.is_area_scoped());

drop policy if exists "active users read" on public.sales_targets;
create policy "area read" on public.sales_targets for select to authenticated
  using (public.is_active_user() and (not public.is_area_scoped() or user_id = auth.uid()));

drop policy if exists "active users read" on public.marketing_executives;
create policy "area read" on public.marketing_executives for select to authenticated
  using (public.is_active_user() and (not public.is_area_scoped() or user_id = auth.uid()));

create index if not exists customers_block_idx on public.customers (block_id);
create index if not exists customers_district_idx on public.customers (district_id);
create index if not exists orders_created_by_idx on public.orders (created_by);
