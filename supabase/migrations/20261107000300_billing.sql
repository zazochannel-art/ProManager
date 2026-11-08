-- =============================================================================
-- ProManager — Stage 3: plans, subscriptions, billing events
-- Clients can READ plans and their own subscription. All writes to
-- subscriptions/billing_events happen server-side with the secret key
-- (payment-provider webhooks), never from the browser.
-- =============================================================================

create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'paused');
create type public.billing_interval as enum ('month', 'year');

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]{2,40}$'),
  name text not null,
  description text,
  price_amount numeric(12, 2) not null default 0 check (price_amount >= 0),
  price_currency char(3) not null default 'EUR' references public.currencies (code),
  billing_interval public.billing_interval not null default 'month',
  -- Limits are data, not code: {"max_members": 3, "max_projects": 10, "storage_mb": 500}
  limits jsonb not null default '{}'::jsonb check (jsonb_typeof(limits) = 'object'),
  features jsonb not null default '[]'::jsonb check (jsonb_typeof(features) = 'array'),
  is_default boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index plans_single_default on public.plans (is_default) where is_default;

create trigger plans_set_updated_at before update on public.plans
  for each row execute function private.set_updated_at();

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  plan_id uuid not null references public.plans (id),
  status public.subscription_status not null default 'trialing',
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  provider text,
  provider_customer_id text,
  provider_subscription_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
-- One live subscription per organization.
create unique index subscriptions_one_live_per_org
  on public.subscriptions (organization_id)
  where status in ('trialing', 'active', 'past_due', 'paused');
create index subscriptions_status_idx on public.subscriptions (status);

create trigger subscriptions_set_updated_at before update on public.subscriptions
  for each row execute function private.set_updated_at();

create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  -- Webhook idempotency: the same provider event is stored at most once.
  unique (provider, provider_event_id)
);
create index billing_events_org_idx on public.billing_events (organization_id);

alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.billing_events enable row level security;

create policy "plans: active plans are public"
  on public.plans for select to anon, authenticated
  using (is_active);

create policy "subscriptions: members can read"
  on public.subscriptions for select to authenticated
  using (private.is_org_member(organization_id));

-- billing_events: no client policies at all (service role only).

create or replace function private.start_default_subscription(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan uuid;
begin
  select p.id into v_plan from public.plans p where p.is_default and p.is_active limit 1;
  if v_plan is null then
    return;
  end if;
  insert into public.subscriptions (organization_id, plan_id, status, trial_ends_at, current_period_end)
  values (p_organization_id, v_plan, 'trialing', now() + interval '14 days', now() + interval '14 days');
end;
$$;
revoke all on function private.start_default_subscription(uuid) from public;

-- Plan limit lookup used by enforcement triggers (e.g. member count).
create or replace function private.plan_limit(p_organization_id uuid, p_key text)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select (p.limits ->> p_key)::int
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.organization_id = p_organization_id
    and s.status in ('trialing', 'active', 'past_due')
  limit 1;
$$;
revoke all on function private.plan_limit(uuid, text) from public;
grant execute on function private.plan_limit(uuid, text) to authenticated, service_role;

create or replace function private.enforce_member_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit int := private.plan_limit(new.organization_id, 'max_members');
  v_count int;
begin
  if v_limit is null or new.status <> 'active' then
    return new;
  end if;
  select count(*) into v_count
  from public.organization_members m
  where m.organization_id = new.organization_id and m.status = 'active' and m.id <> new.id;
  if v_count >= v_limit then
    raise exception 'member limit of current plan reached' using errcode = '54000';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_member_limit() from public;

create trigger organization_members_enforce_limit
  before insert or update of status on public.organization_members
  for each row execute function private.enforce_member_limit();

-- Plan catalogue (product data, not demo data). Prices can be changed by operators.
insert into public.plans (code, name, description, price_amount, price_currency, limits, features, is_default, sort_order) values
  ('free', 'Free', 'For freelancers getting started', 0, 'EUR',
   '{"max_members": 2, "max_projects": 5, "max_customers": 50, "storage_mb": 200}',
   '["customers", "projects", "estimates", "invoices"]', true, 1),
  ('business', 'Business', 'For growing service companies', 29, 'EUR',
   '{"max_members": 15, "max_projects": 500, "max_customers": 5000, "storage_mb": 10240}',
   '["customers", "projects", "estimates", "invoices", "inventory", "reports", "client_portal"]', false, 2),
  ('enterprise', 'Enterprise', 'Unlimited teams and automation', 99, 'EUR',
   '{"max_members": 200, "max_projects": 100000, "max_customers": 100000, "storage_mb": 102400}',
   '["customers", "projects", "estimates", "invoices", "inventory", "reports", "client_portal", "automation"]', false, 3);
