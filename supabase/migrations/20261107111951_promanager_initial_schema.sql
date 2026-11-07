-- ProManager v1: multi-tenant operational data model.
-- All tenant-owned rows are isolated by organization membership through RLS.

create extension if not exists pgcrypto with schema extensions;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 160),
  country_code text not null default 'MD' check (country_code ~ '^[A-Z]{2}$'),
  currency_code text not null default 'MDL' check (currency_code ~ '^[A-Z]{3}$'),
  owner_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'manager', 'member')),
  joined_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 200),
  phone text,
  email text,
  address text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid,
  title text not null check (length(trim(title)) between 1 and 240),
  description text,
  category text,
  status text not null default 'scheduled' check (status in ('scheduled', 'in_progress', 'waiting', 'completed', 'cancelled')),
  scheduled_at timestamptz,
  estimated_amount numeric(14,2) not null default 0 check (estimated_amount >= 0),
  currency_code text not null default 'MDL' check (currency_code ~ '^[A-Z]{3}$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, customer_id) references public.customers(organization_id, id)
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null,
  job_id uuid,
  quote_number text not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'rejected', 'expired')),
  valid_until date,
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  currency_code text not null default 'MDL' check (currency_code ~ '^[A-Z]{3}$'),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, quote_number),
  foreign key (organization_id, customer_id) references public.customers(organization_id, id),
  foreign key (organization_id, job_id) references public.jobs(organization_id, id)
);

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null,
  description text not null check (length(trim(description)) > 0),
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  unit text not null default 'buc',
  unit_price numeric(14,2) not null default 0 check (unit_price >= 0),
  line_total numeric(14,2) not null default 0 check (line_total >= 0),
  created_at timestamptz not null default now(),
  foreign key (organization_id, quote_id) references public.quotes(organization_id, id) on delete cascade
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null,
  job_id uuid,
  invoice_number text not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'overdue', 'void')),
  issue_date date not null default current_date,
  due_date date,
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  currency_code text not null default 'MDL' check (currency_code ~ '^[A-Z]{3}$'),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, invoice_number),
  foreign key (organization_id, customer_id) references public.customers(organization_id, id),
  foreign key (organization_id, job_id) references public.jobs(organization_id, id)
);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null,
  description text not null check (length(trim(description)) > 0),
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  unit text not null default 'buc',
  unit_price numeric(14,2) not null default 0 check (unit_price >= 0),
  line_total numeric(14,2) not null default 0 check (line_total >= 0),
  created_at timestamptz not null default now(),
  foreign key (organization_id, invoice_id) references public.invoices(organization_id, id) on delete cascade
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid,
  category text not null check (length(trim(category)) between 1 and 120),
  vendor text,
  description text,
  expense_date date not null default current_date,
  status text not null default 'paid' check (status in ('paid', 'pending', 'void')),
  amount numeric(14,2) not null check (amount >= 0),
  currency_code text not null default 'MDL' check (currency_code ~ '^[A-Z]{3}$'),
  receipt_path text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, job_id) references public.jobs(organization_id, id)
);

create index customers_org_name_idx on public.customers (organization_id, name);
create index jobs_org_status_schedule_idx on public.jobs (organization_id, status, scheduled_at);
create index jobs_org_customer_idx on public.jobs (organization_id, customer_id);
create index quotes_org_status_created_idx on public.quotes (organization_id, status, created_at desc);
create index quote_items_org_quote_idx on public.quote_items (organization_id, quote_id);
create index invoices_org_status_due_idx on public.invoices (organization_id, status, due_date);
create index invoice_items_org_invoice_idx on public.invoice_items (organization_id, invoice_id);
create index expenses_org_date_idx on public.expenses (organization_id, expense_date desc);

-- Invoker rights are intentional: membership checks respect RLS on organization_members.
create or replace function public.is_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members as member
    where member.organization_id = target_organization_id
      and member.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_org_member(uuid) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.customers enable row level security;
alter table public.jobs enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.expenses enable row level security;

grant select, insert, update on public.organizations to authenticated;
grant select, insert on public.organization_members to authenticated;
grant select, insert, update, delete on public.customers, public.jobs, public.quotes, public.quote_items, public.invoices, public.invoice_items, public.expenses to authenticated;

create policy "Users can read organizations they own or belong to"
on public.organizations for select to authenticated
using (owner_id = (select auth.uid()) or public.is_org_member(id));

create policy "Authenticated users can create their own organization"
on public.organizations for insert to authenticated
with check (owner_id = (select auth.uid()));

create policy "Owners can update their organization"
on public.organizations for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "Members can read their own membership"
on public.organization_members for select to authenticated
using (user_id = (select auth.uid()));

create policy "Organization owners can add themselves as owner"
on public.organization_members for insert to authenticated
with check (
  user_id = (select auth.uid())
  and role = 'owner'
  and exists (
    select 1 from public.organizations as organization
    where organization.id = organization_id
      and organization.owner_id = (select auth.uid())
  )
);

create policy "Organization members can read customers" on public.customers for select to authenticated using (public.is_org_member(organization_id));
create policy "Organization members can create customers" on public.customers for insert to authenticated with check (public.is_org_member(organization_id) and (created_by is null or created_by = (select auth.uid())));
create policy "Organization members can update customers" on public.customers for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy "Organization members can delete customers" on public.customers for delete to authenticated using (public.is_org_member(organization_id));

create policy "Organization members can read jobs" on public.jobs for select to authenticated using (public.is_org_member(organization_id));
create policy "Organization members can create jobs" on public.jobs for insert to authenticated with check (public.is_org_member(organization_id) and (created_by is null or created_by = (select auth.uid())));
create policy "Organization members can update jobs" on public.jobs for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy "Organization members can delete jobs" on public.jobs for delete to authenticated using (public.is_org_member(organization_id));

create policy "Organization members can read quotes" on public.quotes for select to authenticated using (public.is_org_member(organization_id));
create policy "Organization members can create quotes" on public.quotes for insert to authenticated with check (public.is_org_member(organization_id) and (created_by is null or created_by = (select auth.uid())));
create policy "Organization members can update quotes" on public.quotes for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy "Organization members can delete quotes" on public.quotes for delete to authenticated using (public.is_org_member(organization_id));

create policy "Organization members can read quote items" on public.quote_items for select to authenticated using (public.is_org_member(organization_id));
create policy "Organization members can create quote items" on public.quote_items for insert to authenticated with check (public.is_org_member(organization_id));
create policy "Organization members can update quote items" on public.quote_items for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy "Organization members can delete quote items" on public.quote_items for delete to authenticated using (public.is_org_member(organization_id));

create policy "Organization members can read invoices" on public.invoices for select to authenticated using (public.is_org_member(organization_id));
create policy "Organization members can create invoices" on public.invoices for insert to authenticated with check (public.is_org_member(organization_id) and (created_by is null or created_by = (select auth.uid())));
create policy "Organization members can update invoices" on public.invoices for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy "Organization members can delete invoices" on public.invoices for delete to authenticated using (public.is_org_member(organization_id));

create policy "Organization members can read invoice items" on public.invoice_items for select to authenticated using (public.is_org_member(organization_id));
create policy "Organization members can create invoice items" on public.invoice_items for insert to authenticated with check (public.is_org_member(organization_id));
create policy "Organization members can update invoice items" on public.invoice_items for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy "Organization members can delete invoice items" on public.invoice_items for delete to authenticated using (public.is_org_member(organization_id));

create policy "Organization members can read expenses" on public.expenses for select to authenticated using (public.is_org_member(organization_id));
create policy "Organization members can create expenses" on public.expenses for insert to authenticated with check (public.is_org_member(organization_id) and (created_by is null or created_by = (select auth.uid())));
create policy "Organization members can update expenses" on public.expenses for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy "Organization members can delete expenses" on public.expenses for delete to authenticated using (public.is_org_member(organization_id));
