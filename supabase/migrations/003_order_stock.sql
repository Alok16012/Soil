-- Orders reserve stock: items of every non-cancelled order are deducted from inventory.
-- Cancelling or deleting an order puts the stock back; editing adjusts by the difference.

alter table public.inventory alter column quantity type numeric(12,2);
alter table public.order_items add constraint order_items_quantity_positive check (quantity > 0);

-- Change a product's stock by p_delta; refuses to go below zero with a readable message
create or replace function public.apply_stock(p_product uuid, p_delta numeric) returns void
  language plpgsql as $$
declare
  current_qty numeric;
  product_name text;
begin
  if p_product is null or p_delta = 0 then return; end if;
  insert into public.inventory (product_id) values (p_product) on conflict (product_id) do nothing;
  select quantity into current_qty from public.inventory where product_id = p_product for update;
  if current_qty + p_delta < 0 then
    select name into product_name from public.products where id = p_product;
    raise exception 'STOCK_SHORT: "%" ka stock kam hai (available %, required %)',
      product_name, trim_scale(current_qty), trim_scale(-p_delta);
  end if;
  update public.inventory set quantity = quantity + p_delta where product_id = p_product;
end $$;

create or replace function public.order_items_stock() returns trigger
  language plpgsql as $$
declare
  status text;
begin
  -- During an order delete the parent row is already gone; orders_stock_delete handled the stock
  if tg_op in ('DELETE', 'UPDATE') then
    select order_status into status from public.orders where id = old.order_id;
    if found and status <> 'cancelled' then perform public.apply_stock(old.product_id, old.quantity); end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select order_status into status from public.orders where id = new.order_id;
    if found and status <> 'cancelled' then perform public.apply_stock(new.product_id, -new.quantity); end if;
  end if;
  return null;
end $$;
create trigger order_items_stock after insert or update or delete on public.order_items
  for each row execute function public.order_items_stock();

create or replace function public.orders_stock_status() returns trigger
  language plpgsql as $$
declare
  item record;
begin
  if (old.order_status = 'cancelled') is distinct from (new.order_status = 'cancelled') then
    for item in select product_id, quantity from public.order_items where order_id = new.id loop
      perform public.apply_stock(item.product_id,
        case when new.order_status = 'cancelled' then item.quantity else -item.quantity end);
    end loop;
  end if;
  return null;
end $$;
create trigger orders_stock_status after update of order_status on public.orders
  for each row execute function public.orders_stock_status();

create or replace function public.orders_stock_delete() returns trigger
  language plpgsql as $$
declare
  item record;
begin
  if old.order_status <> 'cancelled' then
    for item in select product_id, quantity from public.order_items where order_id = old.id loop
      perform public.apply_stock(item.product_id, item.quantity);
    end loop;
  end if;
  return old;
end $$;
create trigger orders_stock_delete before delete on public.orders
  for each row execute function public.orders_stock_delete();

-- Create or update an order with its items in one transaction (stock check rolls everything back)
create or replace function public.save_order(p_id uuid, p_order jsonb, p_items jsonb) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  v_order_id uuid := p_id;
begin
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'Order me kam se kam ek product hona chahiye';
  end if;
  if v_order_id is null then
    insert into public.orders (order_number, customer_id, order_status, order_date, subtotal, tax_amount, total_amount, notes, created_by)
    values (p_order->>'order_number', (p_order->>'customer_id')::uuid, coalesce(p_order->>'order_status', 'pending'),
            coalesce((p_order->>'order_date')::date, current_date), coalesce((p_order->>'subtotal')::numeric, 0),
            coalesce((p_order->>'tax_amount')::numeric, 0), coalesce((p_order->>'total_amount')::numeric, 0),
            p_order->>'notes', nullif(p_order->>'created_by', '')::uuid)
    returning id into v_order_id;
  else
    -- remove old items first (returns their stock under the old status), then apply the new status and items
    delete from public.order_items where order_items.order_id = p_id;
    update public.orders set
      customer_id = (p_order->>'customer_id')::uuid,
      order_status = coalesce(p_order->>'order_status', order_status),
      order_date = coalesce((p_order->>'order_date')::date, order_date),
      subtotal = coalesce((p_order->>'subtotal')::numeric, 0),
      tax_amount = coalesce((p_order->>'tax_amount')::numeric, 0),
      total_amount = coalesce((p_order->>'total_amount')::numeric, 0),
      notes = p_order->>'notes'
    where id = p_id;
    if not found then raise exception 'Order not found'; end if;
  end if;
  insert into public.order_items (order_id, product_id, quantity, unit_rate, tax_rate, tax_amount, total_amount)
  select v_order_id, (i->>'product_id')::uuid, (i->>'quantity')::numeric, coalesce((i->>'unit_rate')::numeric, 0),
         coalesce((i->>'tax_rate')::numeric, 0), coalesce((i->>'tax_amount')::numeric, 0), coalesce((i->>'total_amount')::numeric, 0)
  from jsonb_array_elements(p_items) i;
  return v_order_id;
end $$;
revoke execute on function public.save_order(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.apply_stock(uuid, numeric) from public, anon, authenticated;
