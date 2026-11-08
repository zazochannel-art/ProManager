-- =============================================================================
-- ProManager — Stage 6: team, suppliers, warehouses, inventory, stock ledger
-- =============================================================================

create type public.employment_type as enum ('full_time', 'part_time', 'contractor', 'seasonal');
create type public.stock_movement_type as enum ('receipt', 'issue', 'adjustment', 'transfer_in', 'transfer_out', 'return');

-- Employees may or may not have an application login (user_id is optional).
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid,
  first_name text not null check (char_length(first_name) between 1 and 100),
  last_name text not null default '' check (char_length(last_name) <= 100),
  email text check (char_length(email) <= 200),
  phone text check (char_length(phone) <= 40),
  position text check (char_length(position) <= 120),
  employment_type public.employment_type not null default 'full_time',
  hourly_cost numeric(12, 2) check (hourly_cost >= 0),
  cost_currency char(3) references public.currencies (code),
  hire_date date,
  termination_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, id),
  unique (organization_id, user_id),
  check (hourly_cost is null or cost_currency is not null),
  check (termination_date is null or hire_date is null or termination_date >= hire_date),
  foreign key (organization_id, user_id) references public.organization_members (organization_id, user_id) on delete set null (user_id)
);
create index employees_org_active_idx on public.employees (organization_id, is_active) where deleted_at is null;

create table public.employee_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  employee_id uuid not null,
  project_id uuid not null,
  role text check (char_length(role) <= 120),
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (end_date is null or start_date is null or end_date >= start_date),
  foreign key (organization_id, employee_id) references public.employees (organization_id, id) on delete cascade,
  foreign key (organization_id, project_id) references public.projects (organization_id, id) on delete cascade
);
create index employee_assignments_project_idx on public.employee_assignments (organization_id, project_id);
create index employee_assignments_employee_idx on public.employee_assignments (organization_id, employee_id);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  tax_id text check (char_length(tax_id) <= 40),
  email text check (char_length(email) <= 200),
  phone text check (char_length(phone) <= 40),
  website text check (char_length(website) <= 200),
  address text check (char_length(address) <= 300),
  country_code char(2) check (country_code ~ '^[A-Z]{2}$'),
  notes text check (char_length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, id)
);
create index suppliers_org_name_idx on public.suppliers (organization_id, lower(name)) where deleted_at is null;

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  address text check (char_length(address) <= 300),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create unique index warehouses_one_default_per_org on public.warehouses (organization_id) where is_default;

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  sku text check (char_length(sku) <= 64),
  name text not null check (char_length(name) between 1 and 200),
  description text check (char_length(description) <= 5000),
  unit text not null default 'pcs' check (char_length(unit) between 1 and 16),
  unit_cost numeric(14, 2) check (unit_cost >= 0),
  sale_price numeric(14, 2) check (sale_price >= 0),
  currency char(3) references public.currencies (code),
  reorder_level numeric(14, 3) check (reorder_level >= 0),
  supplier_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, id),
  unique (organization_id, sku),
  check ((unit_cost is null and sale_price is null) or currency is not null),
  foreign key (organization_id, supplier_id) references public.suppliers (organization_id, id)
);
create index inventory_items_org_name_idx on public.inventory_items (organization_id, lower(name)) where deleted_at is null;

-- Append-only stock ledger. Quantity sign is enforced per movement type.
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  item_id uuid not null,
  warehouse_id uuid not null,
  project_id uuid,
  movement_type public.stock_movement_type not null,
  quantity numeric(14, 3) not null check (quantity <> 0),
  unit_cost numeric(14, 2) check (unit_cost >= 0),
  occurred_at timestamptz not null default now(),
  reference text check (char_length(reference) <= 120),
  notes text check (char_length(notes) <= 2000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  check (
    (movement_type in ('receipt', 'transfer_in', 'return') and quantity > 0)
    or (movement_type in ('issue', 'transfer_out') and quantity < 0)
    or movement_type = 'adjustment'
  ),
  foreign key (organization_id, item_id) references public.inventory_items (organization_id, id),
  foreign key (organization_id, warehouse_id) references public.warehouses (organization_id, id),
  foreign key (organization_id, project_id) references public.projects (organization_id, id)
);
create index stock_movements_item_idx on public.stock_movements (organization_id, item_id, occurred_at desc);
create index stock_movements_project_idx on public.stock_movements (organization_id, project_id);

-- Current stock per item and warehouse (RLS of the caller applies).
create view public.inventory_stock_levels
with (security_invoker = true) as
select
  sm.organization_id,
  sm.item_id,
  sm.warehouse_id,
  sum(sm.quantity) as quantity_on_hand
from public.stock_movements sm
group by sm.organization_id, sm.item_id, sm.warehouse_id;

select private.setup_tenant_table('employees', 'team.read', 'team.manage', 'team.manage');
select private.setup_tenant_table('employee_assignments', 'team.read', 'team.manage', 'team.manage');
select private.setup_tenant_table('suppliers', 'suppliers.read', 'suppliers.write', 'suppliers.write');
select private.setup_tenant_table('warehouses', 'inventory.read', 'inventory.write', 'inventory.write', false);
select private.setup_tenant_table('inventory_items', 'inventory.read', 'inventory.write', 'inventory.write');

-- stock_movements: insert-only ledger (corrections are new adjustment rows).
select private.setup_tenant_table('stock_movements', 'inventory.read', null, null, true, false);
create policy "stock_movements: insert"
  on public.stock_movements for insert to authenticated
  with check (
    private.has_permission(organization_id, 'inventory.write')
    and created_by = (select auth.uid())
  );
