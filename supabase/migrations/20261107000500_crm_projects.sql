-- =============================================================================
-- ProManager — Stage 5: customers, projects, tasks, calendar, time tracking
-- Every child row references its parent through (organization_id, parent_id)
-- composite foreign keys, so a row can never point at another tenant's data.
-- =============================================================================

create type public.customer_type as enum ('company', 'individual');
create type public.address_type as enum ('billing', 'site', 'shipping', 'other');
create type public.project_status as enum ('planned', 'active', 'on_hold', 'completed', 'cancelled');
create type public.task_status as enum ('todo', 'in_progress', 'blocked', 'done', 'cancelled');
create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');

-- -----------------------------------------------------------------------------
-- customers
-- -----------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  type public.customer_type not null default 'company',
  name text not null check (char_length(name) between 1 and 200),
  legal_name text check (char_length(legal_name) <= 200),
  tax_id text check (char_length(tax_id) <= 40),
  email text check (char_length(email) <= 200),
  phone text check (char_length(phone) <= 40),
  website text check (char_length(website) <= 200),
  preferred_currency char(3) references public.currencies (code),
  preferred_locale public.app_locale,
  notes text check (char_length(notes) <= 5000),
  tags text[] not null default '{}',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, id)
);
create index customers_org_idx on public.customers (organization_id) where deleted_at is null;
create index customers_org_name_idx on public.customers (organization_id, lower(name));
create index customers_org_created_idx on public.customers (organization_id, created_at desc);

create table public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  customer_id uuid not null,
  full_name text not null check (char_length(full_name) between 1 and 200),
  position text check (char_length(position) <= 120),
  email text check (char_length(email) <= 200),
  phone text check (char_length(phone) <= 40),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, customer_id) references public.customers (organization_id, id) on delete cascade
);
create index customer_contacts_customer_idx on public.customer_contacts (organization_id, customer_id);

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  customer_id uuid not null,
  type public.address_type not null default 'billing',
  line1 text not null check (char_length(line1) <= 200),
  line2 text check (char_length(line2) <= 200),
  city text check (char_length(city) <= 100),
  region text check (char_length(region) <= 100),
  postal_code text check (char_length(postal_code) <= 20),
  country_code char(2) not null check (country_code ~ '^[A-Z]{2}$'),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, customer_id) references public.customers (organization_id, id) on delete cascade
);
create index customer_addresses_customer_idx on public.customer_addresses (organization_id, customer_id);

-- -----------------------------------------------------------------------------
-- projects
-- -----------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  customer_id uuid,
  code text check (char_length(code) <= 40),
  name text not null check (char_length(name) between 1 and 200),
  description text check (char_length(description) <= 10000),
  status public.project_status not null default 'planned',
  start_date date,
  end_date date,
  budget_amount numeric(14, 2) check (budget_amount >= 0),
  currency char(3) not null references public.currencies (code),
  site_address text check (char_length(site_address) <= 300),
  manager_user_id uuid,
  completed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, id),
  unique (organization_id, code),
  check (end_date is null or start_date is null or end_date >= start_date),
  foreign key (organization_id, customer_id) references public.customers (organization_id, id),
  -- Project manager must be a member of the same organization.
  foreign key (organization_id, manager_user_id) references public.organization_members (organization_id, user_id) on delete set null (manager_user_id)
);
create index projects_org_status_idx on public.projects (organization_id, status) where deleted_at is null;
create index projects_org_customer_idx on public.projects (organization_id, customer_id);
create index projects_org_dates_idx on public.projects (organization_id, start_date, end_date);

create table public.project_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null,
  user_id uuid not null,
  project_role text not null default 'member' check (project_role in ('lead', 'member', 'observer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (project_id, user_id),
  foreign key (organization_id, project_id) references public.projects (organization_id, id) on delete cascade,
  foreign key (organization_id, user_id) references public.organization_members (organization_id, user_id) on delete cascade
);
create index project_members_user_idx on public.project_members (organization_id, user_id);

-- Work breakdown / phases of a project (e.g. "Demolition", "Electrical rough-in").
create table public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null,
  parent_id uuid,
  name text not null check (char_length(name) between 1 and 200),
  description text check (char_length(description) <= 5000),
  sort_order int not null default 0,
  planned_start date,
  planned_end date,
  planned_hours numeric(10, 2) check (planned_hours >= 0),
  planned_cost numeric(14, 2) check (planned_cost >= 0),
  progress_percent smallint not null default 0 check (progress_percent between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (planned_end is null or planned_start is null or planned_end >= planned_start),
  foreign key (organization_id, project_id) references public.projects (organization_id, id) on delete cascade,
  foreign key (organization_id, parent_id) references public.project_tasks (organization_id, id) on delete cascade
);
create index project_tasks_project_idx on public.project_tasks (organization_id, project_id, sort_order);

-- Actionable to-dos, optionally linked to a project / project phase / customer.
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid,
  project_task_id uuid,
  customer_id uuid,
  title text not null check (char_length(title) between 1 and 300),
  description text check (char_length(description) <= 10000),
  status public.task_status not null default 'todo',
  priority public.task_priority not null default 'medium',
  assignee_id uuid,
  due_at timestamptz,
  completed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, project_id) references public.projects (organization_id, id) on delete cascade,
  foreign key (organization_id, project_task_id) references public.project_tasks (organization_id, id) on delete set null (project_task_id),
  foreign key (organization_id, customer_id) references public.customers (organization_id, id),
  foreign key (organization_id, assignee_id) references public.organization_members (organization_id, user_id) on delete set null (assignee_id)
);
create index tasks_org_status_due_idx on public.tasks (organization_id, status, due_at) where deleted_at is null;
create index tasks_org_assignee_idx on public.tasks (organization_id, assignee_id);
create index tasks_org_project_idx on public.tasks (organization_id, project_id);

-- -----------------------------------------------------------------------------
-- calendar events
-- -----------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  description text check (char_length(description) <= 5000),
  location text check (char_length(location) <= 300),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  project_id uuid,
  customer_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (ends_at >= starts_at),
  foreign key (organization_id, project_id) references public.projects (organization_id, id) on delete cascade,
  foreign key (organization_id, customer_id) references public.customers (organization_id, id)
);
create index events_org_starts_idx on public.events (organization_id, starts_at);

-- -----------------------------------------------------------------------------
-- time entries (labour cost source for project profitability)
-- -----------------------------------------------------------------------------
create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null,
  project_id uuid,
  task_id uuid,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_minutes int check (duration_minutes >= 0),
  hourly_cost numeric(12, 2) check (hourly_cost >= 0),
  cost_currency char(3) references public.currencies (code),
  billable boolean not null default true,
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (ended_at is null or ended_at >= started_at),
  check (hourly_cost is null or cost_currency is not null),
  foreign key (organization_id, user_id) references public.organization_members (organization_id, user_id),
  foreign key (organization_id, project_id) references public.projects (organization_id, id) on delete cascade,
  foreign key (organization_id, task_id) references public.tasks (organization_id, id) on delete set null (task_id)
);
create index time_entries_org_user_idx on public.time_entries (organization_id, user_id, started_at desc);
create index time_entries_org_project_idx on public.time_entries (organization_id, project_id);

-- -----------------------------------------------------------------------------
-- Policies
-- -----------------------------------------------------------------------------
select private.setup_tenant_table('customers', 'customers.read', 'customers.write', 'customers.delete');
select private.setup_tenant_table('customer_contacts', 'customers.read', 'customers.write', 'customers.write', false);
select private.setup_tenant_table('customer_addresses', 'customers.read', 'customers.write', 'customers.write', false);
select private.setup_tenant_table('projects', 'projects.read', 'projects.write', 'projects.delete');
select private.setup_tenant_table('project_members', 'projects.read', 'projects.write', 'projects.write');
select private.setup_tenant_table('project_tasks', 'projects.read', 'projects.write', 'projects.write', false);
select private.setup_tenant_table('events', 'calendar.read', 'calendar.write', 'calendar.write');

-- tasks: managers write everything; assignees with tasks.update_assigned may
-- update their own tasks, but only the status (enforced by trigger below).
select private.setup_tenant_table('tasks', 'tasks.read', 'tasks.write', 'tasks.write');
create policy "tasks: assignee can update own"
  on public.tasks for update to authenticated
  using (assignee_id = (select auth.uid()) and private.has_permission(organization_id, 'tasks.update_assigned'))
  with check (assignee_id = (select auth.uid()) and private.has_permission(organization_id, 'tasks.update_assigned'));

create or replace function private.restrict_assignee_task_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or private.has_permission(new.organization_id, 'tasks.write') then
    return new;
  end if;
  if (to_jsonb(new) - array['status', 'completed_at', 'updated_at'])
     is distinct from (to_jsonb(old) - array['status', 'completed_at', 'updated_at']) then
    raise exception 'assignees may only change the task status' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger tasks_restrict_assignee_update before update on public.tasks
  for each row execute function private.restrict_assignee_task_update();

-- time_entries: managers see/manage all; members manage their own.
select private.setup_tenant_table('time_entries', null, null, null, true);
create policy "time_entries: select"
  on public.time_entries for select to authenticated
  using (
    private.has_permission(organization_id, 'time.read')
    or (user_id = (select auth.uid()) and private.is_org_member(organization_id))
  );
create policy "time_entries: insert"
  on public.time_entries for insert to authenticated
  with check (
    private.has_permission(organization_id, 'time.manage')
    or (user_id = (select auth.uid()) and private.has_permission(organization_id, 'time.write_own'))
  );
create policy "time_entries: update"
  on public.time_entries for update to authenticated
  using (
    private.has_permission(organization_id, 'time.manage')
    or (user_id = (select auth.uid()) and private.has_permission(organization_id, 'time.write_own'))
  )
  with check (
    private.has_permission(organization_id, 'time.manage')
    or (user_id = (select auth.uid()) and private.has_permission(organization_id, 'time.write_own'))
  );
create policy "time_entries: delete"
  on public.time_entries for delete to authenticated
  using (
    private.has_permission(organization_id, 'time.manage')
    or (user_id = (select auth.uid()) and private.has_permission(organization_id, 'time.write_own'))
  );

-- Completion timestamps maintained by the database.
create or replace function private.track_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'projects' then
    if new.status = 'completed' and (tg_op = 'INSERT' or old.status <> 'completed') then
      new.completed_at := coalesce(new.completed_at, now());
    elsif new.status <> 'completed' then
      new.completed_at := null;
    end if;
  elsif tg_table_name = 'tasks' then
    if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
      new.completed_at := coalesce(new.completed_at, now());
    elsif new.status <> 'done' then
      new.completed_at := null;
    end if;
  end if;
  return new;
end;
$$;
create trigger projects_track_completion before insert or update of status on public.projects
  for each row execute function private.track_completion();
create trigger tasks_track_completion before insert or update of status on public.tasks
  for each row execute function private.track_completion();
