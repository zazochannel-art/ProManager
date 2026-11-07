-- =============================================================================
-- ProManager — Stage 7: financial documents
-- tax_rates, document_sequences, estimates, invoices, payments, allocations,
-- expense categories and expenses.
--
-- Principles
--   * Money is NUMERIC, never float. Every financial document stores currency.
--   * Line math lives in GENERATED columns; document totals are recalculated by
--     the database. Clients cannot write totals, numbers or statuses directly.
--   * Issued documents are immutable for API users (current_user =
--     'authenticated'); only SECURITY DEFINER workflow functions change them.
--   * Payments are recorded only through public.record_payment(), which is
--     transactional, row-locking and idempotent.
--   * No VAT rate is hard-coded: rates are rows with effective dates.
-- =============================================================================

create type public.estimate_status as enum ('draft', 'sent', 'accepted', 'rejected', 'expired', 'converted');
create type public.invoice_status as enum ('draft', 'issued', 'partially_paid', 'paid', 'void');
create type public.payment_method as enum ('cash', 'bank_transfer', 'card', 'online', 'other');
create type public.expense_kind as enum ('material', 'labor', 'subcontractor', 'equipment', 'transport', 'overhead', 'other');
create type public.expense_payment_status as enum ('unpaid', 'paid');
create type public.document_type as enum ('estimate', 'invoice', 'payment');

-- -----------------------------------------------------------------------------
-- Tax rates with effective dates (configured per organization)
-- -----------------------------------------------------------------------------
create table public.tax_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  rate numeric(7, 4) not null check (rate >= 0 and rate <= 100),
  country_code char(2) check (country_code ~ '^[A-Z]{2}$'),
  valid_from date not null,
  valid_to date,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (valid_to is null or valid_to >= valid_from)
);
create index tax_rates_org_idx on public.tax_rates (organization_id, valid_from);

select private.setup_tenant_table('tax_rates', 'org.read', 'settings.manage', 'settings.manage');

-- Rate applicable on a given date (helper for UIs and documents).
create or replace function public.applicable_tax_rates(p_organization_id uuid, p_on date default current_date)
returns setof public.tax_rates
language sql
stable
security invoker
set search_path = ''
as $$
  select t.*
  from public.tax_rates t
  where t.organization_id = p_organization_id
    and t.is_active
    and t.valid_from <= p_on
    and (t.valid_to is null or t.valid_to >= p_on)
  order by t.is_default desc, t.rate desc;
$$;

-- -----------------------------------------------------------------------------
-- Atomic document numbering
-- -----------------------------------------------------------------------------
create table public.document_sequences (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  document_type public.document_type not null,
  period_year int not null check (period_year between 2000 and 2999),
  prefix text not null check (char_length(prefix) between 1 and 12),
  next_value bigint not null default 1 check (next_value > 0),
  padding smallint not null default 4 check (padding between 1 and 10),
  updated_at timestamptz not null default now(),
  primary key (organization_id, document_type, period_year)
);
alter table public.document_sequences enable row level security;
create policy "document_sequences: admins can read"
  on public.document_sequences for select to authenticated
  using (private.has_permission(organization_id, 'settings.manage'));
-- Writes only through private.next_document_number().

create or replace function private.next_document_number(
  p_organization_id uuid,
  p_type public.document_type,
  p_date date default current_date
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year int := extract(year from coalesce(p_date, current_date))::int;
  v_default_prefix text := case p_type when 'estimate' then 'EST' when 'invoice' then 'INV' else 'PAY' end;
  v_value bigint;
  v_prefix text;
  v_padding smallint;
begin
  if (select auth.uid()) is not null and not private.is_org_member(p_organization_id) then
    raise exception 'not a member of this organization' using errcode = '42501';
  end if;

  -- INSERT .. ON CONFLICT takes a row lock, so concurrent callers are serialized
  -- and never receive the same number.
  insert into public.document_sequences as s (organization_id, document_type, period_year, prefix, next_value)
  values (p_organization_id, p_type, v_year, v_default_prefix, 2)
  on conflict (organization_id, document_type, period_year)
  do update set next_value = s.next_value + 1, updated_at = now()
  returning s.next_value - 1, s.prefix, s.padding into v_value, v_prefix, v_padding;

  return v_prefix || '-' || v_year || '-' || lpad(v_value::text, v_padding, '0');
end;
$$;
revoke all on function private.next_document_number(uuid, public.document_type, date) from public;

-- -----------------------------------------------------------------------------
-- Shared line-item math (GENERATED columns — authoritative).
--   line_subtotal = round(quantity * unit_price, 2)
--   line_discount = round(line_subtotal * discount_percent / 100, 2)
--   line_tax      = round((line_subtotal - line_discount) * tax_rate / 100, 2)
--   line_total    = line_subtotal - line_discount + line_tax
-- src/lib/calculations/documents.ts mirrors this for live previews; an
-- integration test asserts both produce identical results.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- Estimates
-- -----------------------------------------------------------------------------
create table public.estimates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  number text,
  customer_id uuid not null,
  project_id uuid,
  status public.estimate_status not null default 'draft',
  currency char(3) not null references public.currencies (code),
  issue_date date not null default current_date,
  valid_until date,
  title text check (char_length(title) <= 200),
  notes text check (char_length(notes) <= 10000),
  terms text check (char_length(terms) <= 10000),
  subtotal numeric(14, 2) not null default 0,
  discount_total numeric(14, 2) not null default 0,
  tax_total numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  customer_snapshot jsonb,
  sent_at timestamptz,
  accepted_at timestamptz,
  converted_invoice_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, id),
  unique (organization_id, number),
  check (valid_until is null or valid_until >= issue_date),
  foreign key (organization_id, customer_id) references public.customers (organization_id, id),
  foreign key (organization_id, project_id) references public.projects (organization_id, id)
);
create index estimates_org_status_idx on public.estimates (organization_id, status, issue_date desc) where deleted_at is null;
create index estimates_org_customer_idx on public.estimates (organization_id, customer_id);

create table public.estimate_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  estimate_id uuid not null,
  position int not null default 0,
  description text not null check (char_length(description) between 1 and 1000),
  unit text not null default 'pcs' check (char_length(unit) between 1 and 16),
  quantity numeric(14, 3) not null check (quantity > 0),
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  discount_percent numeric(5, 2) not null default 0 check (discount_percent between 0 and 100),
  tax_rate_id uuid,
  tax_rate numeric(7, 4) not null default 0 check (tax_rate between 0 and 100),
  inventory_item_id uuid,
  line_subtotal numeric(14, 2) generated always as (round(quantity * unit_price, 2)) stored,
  line_discount numeric(14, 2) generated always as (round(round(quantity * unit_price, 2) * discount_percent / 100, 2)) stored,
  line_tax numeric(14, 2) generated always as (
    round((round(quantity * unit_price, 2) - round(round(quantity * unit_price, 2) * discount_percent / 100, 2)) * tax_rate / 100, 2)
  ) stored,
  line_total numeric(14, 2) generated always as (
    round(quantity * unit_price, 2)
    - round(round(quantity * unit_price, 2) * discount_percent / 100, 2)
    + round((round(quantity * unit_price, 2) - round(round(quantity * unit_price, 2) * discount_percent / 100, 2)) * tax_rate / 100, 2)
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, estimate_id) references public.estimates (organization_id, id) on delete cascade,
  foreign key (organization_id, tax_rate_id) references public.tax_rates (organization_id, id),
  foreign key (organization_id, inventory_item_id) references public.inventory_items (organization_id, id)
);
create index estimate_items_estimate_idx on public.estimate_items (organization_id, estimate_id, position);

-- -----------------------------------------------------------------------------
-- Invoices
-- -----------------------------------------------------------------------------
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  number text,
  customer_id uuid not null,
  project_id uuid,
  estimate_id uuid,
  status public.invoice_status not null default 'draft',
  currency char(3) not null references public.currencies (code),
  issue_date date not null default current_date,
  due_date date,
  notes text check (char_length(notes) <= 10000),
  terms text check (char_length(terms) <= 10000),
  subtotal numeric(14, 2) not null default 0,
  discount_total numeric(14, 2) not null default 0,
  tax_total numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0 check (total >= 0),
  amount_paid numeric(14, 2) not null default 0 check (amount_paid >= 0),
  balance_due numeric(14, 2) generated always as (total - amount_paid) stored,
  allow_overpayment boolean not null default false,
  customer_snapshot jsonb,
  organization_snapshot jsonb,
  issued_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,
  void_reason text check (char_length(void_reason) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, id),
  unique (organization_id, number),
  check (due_date is null or due_date >= issue_date),
  check (allow_overpayment or amount_paid <= total),
  check (status = 'draft' or number is not null),
  foreign key (organization_id, customer_id) references public.customers (organization_id, id),
  foreign key (organization_id, project_id) references public.projects (organization_id, id),
  foreign key (organization_id, estimate_id) references public.estimates (organization_id, id)
);
create index invoices_org_status_due_idx on public.invoices (organization_id, status, due_date) where deleted_at is null;
create index invoices_org_issue_date_idx on public.invoices (organization_id, issue_date desc);
create index invoices_org_customer_idx on public.invoices (organization_id, customer_id);
create index invoices_org_project_idx on public.invoices (organization_id, project_id);

alter table public.estimates
  add constraint estimates_converted_invoice_fk
  foreign key (organization_id, converted_invoice_id) references public.invoices (organization_id, id);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  invoice_id uuid not null,
  position int not null default 0,
  description text not null check (char_length(description) between 1 and 1000),
  unit text not null default 'pcs' check (char_length(unit) between 1 and 16),
  quantity numeric(14, 3) not null check (quantity > 0),
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  discount_percent numeric(5, 2) not null default 0 check (discount_percent between 0 and 100),
  tax_rate_id uuid,
  tax_rate numeric(7, 4) not null default 0 check (tax_rate between 0 and 100),
  inventory_item_id uuid,
  line_subtotal numeric(14, 2) generated always as (round(quantity * unit_price, 2)) stored,
  line_discount numeric(14, 2) generated always as (round(round(quantity * unit_price, 2) * discount_percent / 100, 2)) stored,
  line_tax numeric(14, 2) generated always as (
    round((round(quantity * unit_price, 2) - round(round(quantity * unit_price, 2) * discount_percent / 100, 2)) * tax_rate / 100, 2)
  ) stored,
  line_total numeric(14, 2) generated always as (
    round(quantity * unit_price, 2)
    - round(round(quantity * unit_price, 2) * discount_percent / 100, 2)
    + round((round(quantity * unit_price, 2) - round(round(quantity * unit_price, 2) * discount_percent / 100, 2)) * tax_rate / 100, 2)
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, invoice_id) references public.invoices (organization_id, id) on delete cascade,
  foreign key (organization_id, tax_rate_id) references public.tax_rates (organization_id, id),
  foreign key (organization_id, inventory_item_id) references public.inventory_items (organization_id, id)
);
create index invoice_items_invoice_idx on public.invoice_items (organization_id, invoice_id, position);

-- -----------------------------------------------------------------------------
-- Payments and allocations
-- -----------------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  number text not null,
  customer_id uuid not null,
  amount numeric(14, 2) not null check (amount > 0),
  currency char(3) not null references public.currencies (code),
  method public.payment_method not null default 'bank_transfer',
  paid_on date not null default current_date,
  reference text check (char_length(reference) <= 120),
  notes text check (char_length(notes) <= 2000),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 120),
  voided_at timestamptz,
  void_reason text check (char_length(void_reason) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, number),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, customer_id) references public.customers (organization_id, id)
);
create index payments_org_paid_on_idx on public.payments (organization_id, paid_on desc);
create index payments_org_customer_idx on public.payments (organization_id, customer_id);

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  payment_id uuid not null,
  invoice_id uuid not null,
  amount numeric(14, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (payment_id, invoice_id),
  foreign key (organization_id, payment_id) references public.payments (organization_id, id) on delete cascade,
  foreign key (organization_id, invoice_id) references public.invoices (organization_id, id)
);
create index payment_allocations_invoice_idx on public.payment_allocations (organization_id, invoice_id);

-- -----------------------------------------------------------------------------
-- Expenses
-- -----------------------------------------------------------------------------
create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  kind public.expense_kind not null default 'other',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  category_id uuid,
  kind public.expense_kind not null default 'other',
  project_id uuid,
  supplier_id uuid,
  description text not null check (char_length(description) between 1 and 500),
  amount numeric(14, 2) not null check (amount >= 0),
  tax_amount numeric(14, 2) not null default 0 check (tax_amount >= 0),
  total numeric(14, 2) generated always as (amount + tax_amount) stored,
  currency char(3) not null references public.currencies (code),
  expense_date date not null default current_date,
  payment_status public.expense_payment_status not null default 'unpaid',
  paid_on date,
  reference text check (char_length(reference) <= 120),
  receipt_document_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, category_id) references public.expense_categories (organization_id, id),
  foreign key (organization_id, project_id) references public.projects (organization_id, id),
  foreign key (organization_id, supplier_id) references public.suppliers (organization_id, id)
);
create index expenses_org_date_idx on public.expenses (organization_id, expense_date desc) where deleted_at is null;
create index expenses_org_project_idx on public.expenses (organization_id, project_id);

-- -----------------------------------------------------------------------------
-- Column privileges: clients can never write totals, numbers, statuses of
-- invoices, snapshots or payment state directly.
-- -----------------------------------------------------------------------------
revoke insert, update on public.estimates, public.invoices, public.payments, public.payment_allocations from authenticated;
grant insert (organization_id, customer_id, project_id, currency, issue_date, valid_until, title, notes, terms, created_by)
  on public.estimates to authenticated;
grant update (customer_id, project_id, currency, issue_date, valid_until, title, notes, terms, status, deleted_at)
  on public.estimates to authenticated;
grant insert (organization_id, customer_id, project_id, currency, issue_date, due_date, notes, terms, created_by)
  on public.invoices to authenticated;
grant update (customer_id, project_id, currency, issue_date, due_date, notes, terms, deleted_at)
  on public.invoices to authenticated;

revoke insert, update on public.estimate_items, public.invoice_items from authenticated;
grant insert (organization_id, estimate_id, position, description, unit, quantity, unit_price, discount_percent, tax_rate_id, tax_rate, inventory_item_id)
  on public.estimate_items to authenticated;
grant update (position, description, unit, quantity, unit_price, discount_percent, tax_rate_id, tax_rate, inventory_item_id)
  on public.estimate_items to authenticated;
grant insert (organization_id, invoice_id, position, description, unit, quantity, unit_price, discount_percent, tax_rate_id, tax_rate, inventory_item_id)
  on public.invoice_items to authenticated;
grant update (position, description, unit, quantity, unit_price, discount_percent, tax_rate_id, tax_rate, inventory_item_id)
  on public.invoice_items to authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
select private.setup_tenant_table('estimates', 'estimates.read', 'estimates.write', null);
create policy "estimates: delete drafts"
  on public.estimates for delete to authenticated
  using (status = 'draft' and private.has_permission(organization_id, 'estimates.delete'));
select private.setup_tenant_table('estimate_items', 'estimates.read', 'estimates.write', 'estimates.write', false);

select private.setup_tenant_table('invoices', 'invoices.read', 'invoices.write', null);
create policy "invoices: delete drafts"
  on public.invoices for delete to authenticated
  using (status = 'draft' and private.has_permission(organization_id, 'invoices.delete'));
select private.setup_tenant_table('invoice_items', 'invoices.read', 'invoices.write', 'invoices.write', false);

-- Payments / allocations: read via RLS, write only through record_payment().
select private.setup_tenant_table('payments', 'payments.read', null, null);
select private.setup_tenant_table('payment_allocations', 'payments.read', null, null, true, false);

select private.setup_tenant_table('expense_categories', 'expenses.read', 'expenses.write', 'expenses.delete', false);
select private.setup_tenant_table('expenses', 'expenses.read', 'expenses.write', 'expenses.delete');

-- -----------------------------------------------------------------------------
-- Document lifecycle triggers
-- -----------------------------------------------------------------------------

-- Estimates get their number on creation.
create or replace function private.assign_estimate_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.number is null then
    new.number := private.next_document_number(new.organization_id, 'estimate', new.issue_date);
  end if;
  if new.valid_until is null then
    select new.issue_date + s.estimate_valid_days into new.valid_until
    from public.organization_settings s where s.organization_id = new.organization_id;
  end if;
  return new;
end;
$$;
revoke all on function private.assign_estimate_number() from public;
create trigger estimates_assign_number before insert on public.estimates
  for each row execute function private.assign_estimate_number();

-- Status transitions an API user may perform on an estimate.
create or replace function private.guard_estimate_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new; -- workflow functions / service role
  end if;
  if old.status in ('accepted', 'converted') then
    raise exception 'accepted or converted estimates are locked' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if new.status = 'converted' then
      raise exception 'use convert_estimate_to_invoice()' using errcode = '42501';
    end if;
    if new.status = 'sent' then new.sent_at := now(); end if;
    if new.status = 'accepted' then new.accepted_at := now(); end if;
  end if;
  return new;
end;
$$;
create trigger estimates_guard_update before update on public.estimates
  for each row execute function private.guard_estimate_update();

-- Issued invoices are immutable for API users.
create or replace function private.guard_invoice_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if old.status <> 'draft' then
    raise exception 'issued invoices cannot be edited; void and re-issue instead' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger invoices_guard_update before update on public.invoices
  for each row execute function private.guard_invoice_update();

-- Items may change only while the parent document is a draft.
-- Deliberately SECURITY INVOKER: current_user must reflect the API caller.
create or replace function private.guard_document_items()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_row record := coalesce(new, old);
  v_status text;
begin
  if current_user <> 'authenticated' then
    return coalesce(new, old);
  end if;
  if tg_table_name = 'invoice_items' then
    select i.status::text into v_status from public.invoices i
    where i.organization_id = v_row.organization_id and i.id = v_row.invoice_id;
    if v_status is distinct from 'draft' then
      raise exception 'items of an issued invoice cannot be changed' using errcode = '42501';
    end if;
  else
    select e.status::text into v_status from public.estimates e
    where e.organization_id = v_row.organization_id and e.id = v_row.estimate_id;
    if v_status not in ('draft', 'sent', 'rejected', 'expired') then
      raise exception 'items of an accepted or converted estimate cannot be changed' using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
create trigger invoice_items_guard before insert or update or delete on public.invoice_items
  for each row execute function private.guard_document_items();
create trigger estimate_items_guard before insert or update or delete on public.estimate_items
  for each row execute function private.guard_document_items();

-- Totals recalculation (runs as owner so it can write protected columns).
create or replace function private.recalculate_document_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record := coalesce(new, old);
begin
  if tg_table_name = 'invoice_items' then
    update public.invoices i set
      subtotal = coalesce(t.subtotal, 0),
      discount_total = coalesce(t.discount_total, 0),
      tax_total = coalesce(t.tax_total, 0),
      total = coalesce(t.total, 0)
    from (
      select sum(line_subtotal) as subtotal, sum(line_discount) as discount_total,
             sum(line_tax) as tax_total, sum(line_total) as total
      from public.invoice_items
      where organization_id = v_row.organization_id and invoice_id = v_row.invoice_id
    ) t
    where i.organization_id = v_row.organization_id and i.id = v_row.invoice_id;
  else
    update public.estimates e set
      subtotal = coalesce(t.subtotal, 0),
      discount_total = coalesce(t.discount_total, 0),
      tax_total = coalesce(t.tax_total, 0),
      total = coalesce(t.total, 0)
    from (
      select sum(line_subtotal) as subtotal, sum(line_discount) as discount_total,
             sum(line_tax) as tax_total, sum(line_total) as total
      from public.estimate_items
      where organization_id = v_row.organization_id and estimate_id = v_row.estimate_id
    ) t
    where e.organization_id = v_row.organization_id and e.id = v_row.estimate_id;
  end if;
  return null;
end;
$$;
revoke all on function private.recalculate_document_totals() from public;
create trigger invoice_items_recalculate after insert or update or delete on public.invoice_items
  for each row execute function private.recalculate_document_totals();
create trigger estimate_items_recalculate after insert or update or delete on public.estimate_items
  for each row execute function private.recalculate_document_totals();

-- -----------------------------------------------------------------------------
-- Workflow functions (SECURITY DEFINER, explicit permission checks)
-- -----------------------------------------------------------------------------

-- Issue a draft invoice: assign gap-free number, freeze snapshots.
create or replace function public.issue_invoice(p_invoice_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invoices%rowtype;
  v_due_days int;
begin
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found or not private.has_permission(v_inv.organization_id, 'invoices.write') then
    raise exception 'invoice not found or permission denied' using errcode = '42501';
  end if;
  if v_inv.status <> 'draft' or v_inv.deleted_at is not null then
    raise exception 'only draft invoices can be issued' using errcode = '22023';
  end if;
  if not exists (select 1 from public.invoice_items where organization_id = v_inv.organization_id and invoice_id = v_inv.id) then
    raise exception 'an invoice needs at least one line item' using errcode = '22023';
  end if;

  select s.invoice_due_days into v_due_days from public.organization_settings s where s.organization_id = v_inv.organization_id;

  update public.invoices i set
    number = private.next_document_number(v_inv.organization_id, 'invoice', v_inv.issue_date),
    status = 'issued',
    issued_at = now(),
    due_date = coalesce(v_inv.due_date, v_inv.issue_date + coalesce(v_due_days, 14)),
    allow_overpayment = coalesce((select s.allow_overpayment from public.organization_settings s where s.organization_id = v_inv.organization_id), false),
    customer_snapshot = (
      select jsonb_build_object(
        'name', c.name, 'legal_name', c.legal_name, 'tax_id', c.tax_id, 'email', c.email, 'phone', c.phone,
        'address', (select to_jsonb(a) - 'organization_id' - 'customer_id' - 'created_at' - 'updated_at'
                    from public.customer_addresses a
                    where a.organization_id = c.organization_id and a.customer_id = c.id and a.type = 'billing'
                    order by a.is_default desc limit 1))
      from public.customers c where c.organization_id = v_inv.organization_id and c.id = v_inv.customer_id),
    organization_snapshot = (
      select jsonb_build_object(
        'name', o.name, 'legal_name', o.legal_name, 'tax_id', o.tax_id, 'registration_number', o.registration_number,
        'address_line1', o.address_line1, 'address_line2', o.address_line2, 'city', o.city,
        'postal_code', o.postal_code, 'country_code', o.country_code, 'email', o.email, 'phone', o.phone)
      from public.organizations o where o.id = v_inv.organization_id)
  where i.id = v_inv.id
  returning * into v_inv;

  return v_inv;
end;
$$;
revoke all on function public.issue_invoice(uuid) from public, anon;
grant execute on function public.issue_invoice(uuid) to authenticated;

-- Recompute paid amount / status from non-voided allocations.
create or replace function private.refresh_invoice_payment_state(p_organization_id uuid, p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paid numeric(14, 2);
begin
  select coalesce(sum(a.amount), 0) into v_paid
  from public.payment_allocations a
  join public.payments p on p.organization_id = a.organization_id and p.id = a.payment_id
  where a.organization_id = p_organization_id and a.invoice_id = p_invoice_id and p.voided_at is null;

  update public.invoices i set
    amount_paid = v_paid,
    status = case
      when i.status = 'void' then 'void'
      when v_paid >= i.total and i.total > 0 then 'paid'
      when v_paid > 0 then 'partially_paid'
      else 'issued'
    end::public.invoice_status,
    paid_at = case when v_paid >= i.total and i.total > 0 then coalesce(i.paid_at, now()) else null end
  where i.organization_id = p_organization_id and i.id = p_invoice_id;
end;
$$;
revoke all on function private.refresh_invoice_payment_state(uuid, uuid) from public;

-- Record a payment and allocate it to invoices in ONE transaction.
-- Idempotent: calling again with the same idempotency key returns the original
-- payment id (and fails if the parameters differ).
create or replace function public.record_payment(
  p_organization_id uuid,
  p_customer_id uuid,
  p_amount numeric,
  p_currency char(3),
  p_method public.payment_method,
  p_paid_on date,
  p_idempotency_key text,
  p_allocations jsonb default '[]'::jsonb,
  p_reference text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.payments%rowtype;
  v_payment_id uuid;
  v_alloc jsonb;
  v_invoice public.invoices%rowtype;
  v_alloc_amount numeric(14, 2);
  v_alloc_total numeric(14, 2) := 0;
begin
  if not private.has_permission(p_organization_id, 'payments.write') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 or round(p_amount, 2) <> p_amount then
    raise exception 'amount must be positive with at most 2 decimals' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_allocations, '[]'::jsonb)) <> 'array' then
    raise exception 'allocations must be an array' using errcode = '22023';
  end if;

  -- Serialize concurrent calls carrying the same key.
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || p_idempotency_key, 0));

  select * into v_existing from public.payments
  where organization_id = p_organization_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.amount <> p_amount or v_existing.currency <> upper(p_currency) or v_existing.customer_id <> p_customer_id then
      raise exception 'idempotency key reused with different parameters' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;

  if not exists (select 1 from public.customers c where c.organization_id = p_organization_id and c.id = p_customer_id) then
    raise exception 'customer not found' using errcode = '23503';
  end if;

  insert into public.payments (organization_id, number, customer_id, amount, currency, method, paid_on,
                               reference, notes, idempotency_key, created_by)
  values (p_organization_id, private.next_document_number(p_organization_id, 'payment', p_paid_on),
          p_customer_id, p_amount, upper(p_currency), p_method, coalesce(p_paid_on, current_date),
          p_reference, p_notes, p_idempotency_key, (select auth.uid()))
  returning id into v_payment_id;

  for v_alloc in select * from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) loop
    v_alloc_amount := (v_alloc ->> 'amount')::numeric;
    if v_alloc_amount is null or v_alloc_amount <= 0 or round(v_alloc_amount, 2) <> v_alloc_amount then
      raise exception 'allocation amount must be positive with at most 2 decimals' using errcode = '22023';
    end if;

    -- Lock the invoice row so concurrent payments cannot both pass the balance check.
    select * into v_invoice from public.invoices
    where organization_id = p_organization_id and id = (v_alloc ->> 'invoice_id')::uuid
    for update;
    if not found then
      raise exception 'invoice not found' using errcode = '23503';
    end if;
    if v_invoice.status not in ('issued', 'partially_paid') then
      raise exception 'invoice % is not open for payment', v_invoice.number using errcode = '22023';
    end if;
    if v_invoice.customer_id <> p_customer_id then
      raise exception 'invoice % belongs to another customer', v_invoice.number using errcode = '22023';
    end if;
    if v_invoice.currency <> upper(p_currency) then
      raise exception 'currency mismatch for invoice %', v_invoice.number using errcode = '22023';
    end if;
    if not v_invoice.allow_overpayment and v_alloc_amount > v_invoice.balance_due then
      raise exception 'allocation exceeds outstanding balance of invoice %', v_invoice.number using errcode = '23514';
    end if;

    v_alloc_total := v_alloc_total + v_alloc_amount;
    if v_alloc_total > p_amount then
      raise exception 'allocations exceed the payment amount' using errcode = '23514';
    end if;

    insert into public.payment_allocations (organization_id, payment_id, invoice_id, amount)
    values (p_organization_id, v_payment_id, v_invoice.id, v_alloc_amount);

    perform private.refresh_invoice_payment_state(p_organization_id, v_invoice.id);
  end loop;

  return v_payment_id;
end;
$$;
revoke all on function public.record_payment(uuid, uuid, numeric, char, public.payment_method, date, text, jsonb, text, text) from public, anon;
grant execute on function public.record_payment(uuid, uuid, numeric, char, public.payment_method, date, text, jsonb, text, text) to authenticated;

create or replace function public.void_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_invoice_id uuid;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found or not private.has_permission(v_payment.organization_id, 'payments.write') then
    raise exception 'payment not found or permission denied' using errcode = '42501';
  end if;
  if v_payment.voided_at is not null then
    return;
  end if;
  update public.payments set voided_at = now(), void_reason = left(p_reason, 500) where id = p_payment_id;
  for v_invoice_id in
    select a.invoice_id from public.payment_allocations a
    where a.organization_id = v_payment.organization_id and a.payment_id = p_payment_id
  loop
    perform private.refresh_invoice_payment_state(v_payment.organization_id, v_invoice_id);
  end loop;
end;
$$;
revoke all on function public.void_payment(uuid, text) from public, anon;
grant execute on function public.void_payment(uuid, text) to authenticated;

create or replace function public.void_invoice(p_invoice_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invoices%rowtype;
begin
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found or not private.has_permission(v_inv.organization_id, 'invoices.write') then
    raise exception 'invoice not found or permission denied' using errcode = '42501';
  end if;
  if v_inv.status not in ('issued') or v_inv.amount_paid > 0 then
    raise exception 'only issued, unpaid invoices can be voided' using errcode = '22023';
  end if;
  update public.invoices
  set status = 'void', voided_at = now(), void_reason = left(p_reason, 500)
  where id = p_invoice_id;
end;
$$;
revoke all on function public.void_invoice(uuid, text) from public, anon;
grant execute on function public.void_invoice(uuid, text) to authenticated;

-- Convert an accepted (or sent) estimate into a draft invoice, copying lines.
create or replace function public.convert_estimate_to_invoice(p_estimate_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_est public.estimates%rowtype;
  v_invoice_id uuid;
begin
  select * into v_est from public.estimates where id = p_estimate_id for update;
  if not found
     or not private.has_permission(v_est.organization_id, 'invoices.write')
     or not private.has_permission(v_est.organization_id, 'estimates.read') then
    raise exception 'estimate not found or permission denied' using errcode = '42501';
  end if;
  if v_est.status not in ('sent', 'accepted') then
    raise exception 'only sent or accepted estimates can be converted' using errcode = '22023';
  end if;

  insert into public.invoices (organization_id, customer_id, project_id, estimate_id, currency, notes, terms, created_by)
  values (v_est.organization_id, v_est.customer_id, v_est.project_id, v_est.id, v_est.currency, v_est.notes, v_est.terms, (select auth.uid()))
  returning id into v_invoice_id;

  insert into public.invoice_items (organization_id, invoice_id, position, description, unit, quantity, unit_price,
                                    discount_percent, tax_rate_id, tax_rate, inventory_item_id)
  select organization_id, v_invoice_id, position, description, unit, quantity, unit_price,
         discount_percent, tax_rate_id, tax_rate, inventory_item_id
  from public.estimate_items
  where organization_id = v_est.organization_id and estimate_id = v_est.id;

  update public.estimates
  set status = 'converted', converted_invoice_id = v_invoice_id, accepted_at = coalesce(accepted_at, now())
  where id = v_est.id;

  return v_invoice_id;
end;
$$;
revoke all on function public.convert_estimate_to_invoice(uuid) from public, anon;
grant execute on function public.convert_estimate_to_invoice(uuid) to authenticated;

-- Invoice list with derived overdue flag (caller's RLS applies).
create view public.invoice_overview
with (security_invoker = true) as
select
  i.*,
  (i.status in ('issued', 'partially_paid')
    and i.due_date is not null
    and i.due_date < (now() at time zone coalesce(s.timezone, 'UTC'))::date) as is_overdue
from public.invoices i
left join public.organization_settings s on s.organization_id = i.organization_id
where i.deleted_at is null;
