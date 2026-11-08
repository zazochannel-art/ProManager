-- =============================================================================
-- ProManager — Stage 2: multi-tenancy core
-- profiles, organizations, organization_members, organization_settings,
-- organization_invitations, role permissions and RLS helper functions.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '' check (char_length(full_name) <= 120),
  avatar_path text,
  locale public.app_locale not null default 'ro',
  timezone text not null default 'Europe/Chisinau',
  last_organization_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- organizations
-- -----------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$'),
  legal_name text check (char_length(legal_name) <= 200),
  tax_id text check (char_length(tax_id) <= 40),
  registration_number text check (char_length(registration_number) <= 40),
  email text check (char_length(email) <= 200),
  phone text check (char_length(phone) <= 40),
  website text check (char_length(website) <= 200),
  address_line1 text check (char_length(address_line1) <= 200),
  address_line2 text check (char_length(address_line2) <= 200),
  city text check (char_length(city) <= 100),
  postal_code text check (char_length(postal_code) <= 20),
  country_code char(2) not null default 'MD' check (country_code ~ '^[A-Z]{2}$'),
  logo_path text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger organizations_set_updated_at before update on public.organizations
  for each row execute function private.set_updated_at();

alter table public.profiles
  add constraint profiles_last_organization_fk
  foreign key (last_organization_id) references public.organizations (id) on delete set null;

-- -----------------------------------------------------------------------------
-- organization_members
-- -----------------------------------------------------------------------------
create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.org_role not null default 'employee',
  status public.member_status not null default 'active',
  invited_by uuid references auth.users (id) on delete set null,
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id),
  unique (organization_id, id)
);

create index organization_members_user_idx on public.organization_members (user_id) where status = 'active';
create index organization_members_org_idx on public.organization_members (organization_id);

create trigger organization_members_set_updated_at before update on public.organization_members
  for each row execute function private.set_updated_at();
create trigger organization_members_prevent_org_change before update on public.organization_members
  for each row execute function private.prevent_org_change();

-- -----------------------------------------------------------------------------
-- organization_settings (1:1 with organizations)
-- -----------------------------------------------------------------------------
create table public.organization_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  default_currency char(3) not null default 'MDL' references public.currencies (code),
  default_locale public.app_locale not null default 'ro',
  timezone text not null default 'Europe/Chisinau' check (char_length(timezone) between 3 and 64),
  date_format text not null default 'dd.MM.yyyy' check (char_length(date_format) <= 20),
  fiscal_year_start_month smallint not null default 1 check (fiscal_year_start_month between 1 and 12),
  invoice_due_days smallint not null default 14 check (invoice_due_days between 0 and 365),
  estimate_valid_days smallint not null default 30 check (estimate_valid_days between 1 and 365),
  allow_overpayment boolean not null default false,
  onboarding_step public.onboarding_step not null default 'company',
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organization_settings_set_updated_at before update on public.organization_settings
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- organization_invitations
-- Only the SHA-256 hash of the invitation token is stored.
-- -----------------------------------------------------------------------------
create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role public.org_role not null default 'employee' check (role <> 'owner'),
  token_hash text not null unique,
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index organization_invitations_org_idx on public.organization_invitations (organization_id);
create unique index organization_invitations_pending_unique
  on public.organization_invitations (organization_id, lower(email))
  where accepted_at is null and revoked_at is null;

-- -----------------------------------------------------------------------------
-- Role → permission mapping. Lives in the private schema so it cannot be read
-- or changed through the API. Mirrors src/lib/permissions/matrix.ts; an
-- integration test asserts both stay identical.
-- -----------------------------------------------------------------------------
create table private.role_permissions (
  role public.org_role not null,
  permission text not null,
  primary key (role, permission)
);

insert into private.role_permissions (role, permission)
select r.role::public.org_role, p.permission
from (values
  ('org.read',              '{owner,admin,manager,accountant,employee,viewer}'),
  ('org.update',            '{owner,admin}'),
  ('members.read',          '{owner,admin,manager,accountant,employee,viewer}'),
  ('members.manage',        '{owner,admin}'),
  ('settings.manage',       '{owner,admin}'),
  ('billing.read',          '{owner,admin,accountant}'),
  ('billing.manage',        '{owner}'),
  ('dashboard.financials',  '{owner,admin,manager,accountant,viewer}'),
  ('customers.read',        '{owner,admin,manager,accountant,employee,viewer}'),
  ('customers.write',       '{owner,admin,manager,accountant}'),
  ('customers.delete',      '{owner,admin}'),
  ('projects.read',         '{owner,admin,manager,accountant,employee,viewer}'),
  ('projects.write',        '{owner,admin,manager}'),
  ('projects.delete',       '{owner,admin}'),
  ('tasks.read',            '{owner,admin,manager,accountant,employee,viewer}'),
  ('tasks.write',           '{owner,admin,manager}'),
  ('tasks.update_assigned', '{owner,admin,manager,employee}'),
  ('calendar.read',         '{owner,admin,manager,accountant,employee,viewer}'),
  ('calendar.write',        '{owner,admin,manager}'),
  ('time.read',             '{owner,admin,manager,accountant}'),
  ('time.write_own',        '{owner,admin,manager,employee}'),
  ('time.manage',           '{owner,admin,manager}'),
  ('estimates.read',        '{owner,admin,manager,accountant,viewer}'),
  ('estimates.write',       '{owner,admin,manager,accountant}'),
  ('estimates.delete',      '{owner,admin}'),
  ('invoices.read',         '{owner,admin,manager,accountant,viewer}'),
  ('invoices.write',        '{owner,admin,accountant}'),
  ('invoices.delete',       '{owner,admin}'),
  ('payments.read',         '{owner,admin,manager,accountant,viewer}'),
  ('payments.write',        '{owner,admin,accountant}'),
  ('expenses.read',         '{owner,admin,manager,accountant,viewer}'),
  ('expenses.write',        '{owner,admin,manager,accountant}'),
  ('expenses.delete',       '{owner,admin}'),
  ('team.read',             '{owner,admin,manager,accountant}'),
  ('team.manage',           '{owner,admin}'),
  ('inventory.read',        '{owner,admin,manager,accountant,employee,viewer}'),
  ('inventory.write',       '{owner,admin,manager}'),
  ('suppliers.read',        '{owner,admin,manager,accountant,employee,viewer}'),
  ('suppliers.write',       '{owner,admin,manager,accountant}'),
  ('reports.read',          '{owner,admin,manager,accountant,viewer}'),
  ('documents.read',        '{owner,admin,manager,accountant,employee,viewer}'),
  ('documents.write',       '{owner,admin,manager,accountant}'),
  ('documents.delete',      '{owner,admin}'),
  ('portal.manage',         '{owner,admin,manager}'),
  ('notifications.read',    '{owner,admin,manager,accountant,employee,viewer}'),
  ('automation.manage',     '{owner,admin}'),
  ('activity.read',         '{owner,admin}')
) as p(permission, roles)
cross join lateral unnest(p.roles::text[]) as r(role);

revoke all on private.role_permissions from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- RLS helper functions.
--
-- Why SECURITY DEFINER: policies on organization_members (and on every tenant
-- table) must look up the caller's membership. Querying organization_members
-- from inside its own policy would re-trigger the same policy (infinite
-- recursion). These functions run as the table owner, bypass RLS for that one
-- lookup, and only ever answer "does auth.uid() have X in org Y?" — they never
-- return row data. search_path is pinned to '' and every object is
-- schema-qualified. EXECUTE is revoked from PUBLIC and granted only to
-- authenticated (and service_role).
-- -----------------------------------------------------------------------------
create or replace function private.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

create or replace function private.has_permission(p_organization_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.organization_members m
    join private.role_permissions rp on rp.role = m.role
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and rp.permission = p_permission
  );
$$;

create or replace function private.member_role(p_organization_id uuid)
returns public.org_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.organization_members m
  where m.organization_id = p_organization_id
    and m.user_id = (select auth.uid())
    and m.status = 'active';
$$;

-- Organizations shared between the caller and another user (for profile visibility).
create or replace function private.shares_org_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.organization_members mine
    join public.organization_members theirs
      on theirs.organization_id = mine.organization_id
    where mine.user_id = (select auth.uid())
      and mine.status = 'active'
      and theirs.user_id = p_user_id
      and theirs.status = 'active'
  );
$$;

revoke all on function private.is_org_member(uuid) from public;
revoke all on function private.has_permission(uuid, text) from public;
revoke all on function private.member_role(uuid) from public;
revoke all on function private.shares_org_with(uuid) from public;
grant execute on function private.is_org_member(uuid) to authenticated, service_role;
grant execute on function private.has_permission(uuid, text) to authenticated, service_role;
grant execute on function private.member_role(uuid) to authenticated, service_role;
grant execute on function private.shares_org_with(uuid) to authenticated, service_role;

-- Public wrapper so the app can ask the database (the single authority) about a permission.
create or replace function public.has_permission(p_organization_id uuid, p_permission text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.has_permission(p_organization_id, p_permission);
$$;
revoke all on function public.has_permission(uuid, text) from public, anon;
grant execute on function public.has_permission(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- New auth user → profile
-- -----------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_locale public.app_locale := 'ro';
  v_requested text := new.raw_user_meta_data ->> 'locale';
begin
  -- user_metadata is user-editable; it is used ONLY as a UI preference default,
  -- never for authorization.
  if v_requested in ('ro', 'ru', 'en') then
    v_locale := v_requested::public.app_locale;
  end if;

  insert into public.profiles (id, email, full_name, locale)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120),
    v_locale
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Keep profile email in sync with auth.users.
create or replace function private.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = coalesce(new.email, '') where id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function private.handle_user_email_change() from public;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function private.handle_user_email_change();

-- -----------------------------------------------------------------------------
-- Membership integrity: never leave an organization without an active owner,
-- and only owners may grant/revoke the owner role.
-- -----------------------------------------------------------------------------
create or replace function private.guard_member_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := coalesce(new.organization_id, old.organization_id);
  v_actor_role public.org_role;
  v_remaining_owners int;
begin
  -- Service role / migrations (no auth.uid()) are trusted.
  if (select auth.uid()) is not null then
    v_actor_role := private.member_role(v_org);

    if tg_op in ('INSERT', 'UPDATE') and new.role = 'owner'
       and (tg_op = 'INSERT' or old.role <> 'owner')
       and coalesce(v_actor_role::text, '') <> 'owner'
       -- Bootstrap: the creator becomes the first owner of a brand-new organization.
       and not (
         tg_op = 'INSERT'
         and new.user_id = (select auth.uid())
         and exists (select 1 from public.organizations o where o.id = v_org and o.created_by = new.user_id)
         and not exists (select 1 from public.organization_members m where m.organization_id = v_org)
       ) then
      raise exception 'only an owner can grant the owner role' using errcode = '42501';
    end if;

    if tg_op in ('UPDATE', 'DELETE') and old.role = 'owner'
       and coalesce(v_actor_role::text, '') <> 'owner' then
      raise exception 'only an owner can change or remove an owner' using errcode = '42501';
    end if;
  end if;

  if tg_op in ('UPDATE', 'DELETE') and old.role = 'owner' and old.status = 'active' then
    select count(*) into v_remaining_owners
    from public.organization_members m
    where m.organization_id = v_org
      and m.role = 'owner'
      and m.status = 'active'
      and m.id <> old.id;

    if v_remaining_owners = 0
       and (tg_op = 'DELETE' or new.role <> 'owner' or new.status <> 'active')
       and exists (select 1 from public.organizations o where o.id = v_org) then
      raise exception 'an organization must keep at least one active owner' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_member_changes() from public;

create trigger organization_members_guard
  before insert or update or delete on public.organization_members
  for each row execute function private.guard_member_changes();

-- -----------------------------------------------------------------------------
-- RLS: profiles
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy "profiles: read own or co-members"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_org_with(id));

create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
-- No INSERT/DELETE policies: rows are managed by the auth trigger / cascade.

-- Users cannot change their own email through the profile (auth.users owns it).
revoke update on public.profiles from authenticated;
grant update (full_name, avatar_path, locale, timezone, last_organization_id) on public.profiles to authenticated;

-- -----------------------------------------------------------------------------
-- RLS: organizations
-- -----------------------------------------------------------------------------
alter table public.organizations enable row level security;

create policy "organizations: members can read"
  on public.organizations for select to authenticated
  using (private.is_org_member(id));

create policy "organizations: admins can update"
  on public.organizations for update to authenticated
  using (private.has_permission(id, 'org.update'))
  with check (private.has_permission(id, 'org.update'));
-- INSERT happens only through public.create_organization().
-- DELETE is not exposed to clients (soft delete via deleted_at by owners only, below).

revoke update on public.organizations from authenticated;
grant update (name, legal_name, tax_id, registration_number, email, phone, website,
  address_line1, address_line2, city, postal_code, country_code, logo_path)
  on public.organizations to authenticated;

-- -----------------------------------------------------------------------------
-- RLS: organization_members
-- -----------------------------------------------------------------------------
alter table public.organization_members enable row level security;

create policy "members: co-members can read"
  on public.organization_members for select to authenticated
  using (private.is_org_member(organization_id));

create policy "members: managers of members can update"
  on public.organization_members for update to authenticated
  using (private.has_permission(organization_id, 'members.manage'))
  with check (private.has_permission(organization_id, 'members.manage'));

create policy "members: managers can remove, users can leave"
  on public.organization_members for delete to authenticated
  using (
    private.has_permission(organization_id, 'members.manage')
    or user_id = (select auth.uid())
  );
-- INSERT only through create_organization() / accept_invitation().

revoke update on public.organization_members from authenticated;
grant update (role, status) on public.organization_members to authenticated;

-- -----------------------------------------------------------------------------
-- RLS: organization_settings
-- -----------------------------------------------------------------------------
alter table public.organization_settings enable row level security;

create policy "settings: members can read"
  on public.organization_settings for select to authenticated
  using (private.is_org_member(organization_id));

create policy "settings: admins can update"
  on public.organization_settings for update to authenticated
  using (private.has_permission(organization_id, 'settings.manage'))
  with check (private.has_permission(organization_id, 'settings.manage'));

-- -----------------------------------------------------------------------------
-- RLS: organization_invitations
-- -----------------------------------------------------------------------------
alter table public.organization_invitations enable row level security;

create policy "invitations: member managers can read"
  on public.organization_invitations for select to authenticated
  using (private.has_permission(organization_id, 'members.manage'));

create policy "invitations: member managers can create"
  on public.organization_invitations for insert to authenticated
  with check (
    private.has_permission(organization_id, 'members.manage')
    and invited_by = (select auth.uid())
    and accepted_at is null
    and revoked_at is null
  );

create policy "invitations: member managers can revoke"
  on public.organization_invitations for update to authenticated
  using (private.has_permission(organization_id, 'members.manage'))
  with check (private.has_permission(organization_id, 'members.manage'));

revoke update on public.organization_invitations from authenticated;
grant update (revoked_at) on public.organization_invitations to authenticated;

-- -----------------------------------------------------------------------------
-- create_organization: atomic org + owner membership + settings.
-- SECURITY DEFINER because the caller is not yet a member and therefore
-- cannot pass the INSERT checks on organization_members.
-- -----------------------------------------------------------------------------
create or replace function public.create_organization(
  p_name text,
  p_slug text,
  p_country_code char(2) default 'MD',
  p_default_currency char(3) default 'MDL',
  p_locale public.app_locale default 'ro',
  p_timezone text default 'Europe/Chisinau'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_org uuid;
  v_owned int;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  -- Abuse guard: cap organizations a single user can create.
  select count(*) into v_owned
  from public.organizations o
  where o.created_by = v_user and o.deleted_at is null;
  if v_owned >= 10 then
    raise exception 'organization limit reached' using errcode = '54000';
  end if;

  insert into public.organizations (name, slug, country_code, created_by)
  values (trim(p_name), lower(p_slug), upper(p_country_code), v_user)
  returning id into v_org;

  insert into public.organization_members (organization_id, user_id, role, status)
  values (v_org, v_user, 'owner', 'active');

  insert into public.organization_settings (organization_id, default_currency, default_locale, timezone, onboarding_step)
  values (v_org, upper(p_default_currency), p_locale, p_timezone, 'company');

  -- Start on the free plan when the plan catalogue exists (see billing migration).
  perform private.start_default_subscription(v_org);

  update public.profiles set last_organization_id = v_org where id = v_user;

  return v_org;
end;
$$;
revoke all on function public.create_organization(text, text, char, char, public.app_locale, text) from public, anon;
grant execute on function public.create_organization(text, text, char, char, public.app_locale, text) to authenticated;

-- Placeholder; replaced by the billing migration once plans exist.
create or replace function private.start_default_subscription(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  return;
end;
$$;
revoke all on function private.start_default_subscription(uuid) from public;

-- -----------------------------------------------------------------------------
-- accept_invitation: joins the caller to an organization using a raw token.
-- SECURITY DEFINER because the invitee is not yet a member.
-- The invitation e-mail must match the caller's verified auth e-mail.
-- -----------------------------------------------------------------------------
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_email text;
  v_inv public.organization_invitations%rowtype;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select u.email into v_email from auth.users u
  where u.id = v_user and u.email_confirmed_at is not null;
  if v_email is null then
    raise exception 'a verified e-mail address is required' using errcode = '42501';
  end if;

  select * into v_inv
  from public.organization_invitations i
  where i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  for update;

  if not found
     or v_inv.accepted_at is not null
     or v_inv.revoked_at is not null
     or v_inv.expires_at < now()
     or lower(v_inv.email) <> lower(v_email) then
    raise exception 'invitation is invalid or expired' using errcode = '22023';
  end if;

  insert into public.organization_members (organization_id, user_id, role, status, invited_by)
  values (v_inv.organization_id, v_user, v_inv.role, 'active', v_inv.invited_by)
  on conflict (organization_id, user_id) do update set status = 'active', role = excluded.role;

  update public.organization_invitations set accepted_at = now() where id = v_inv.id;
  update public.profiles set last_organization_id = v_inv.organization_id where id = v_user;

  return v_inv.organization_id;
end;
$$;
revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;
