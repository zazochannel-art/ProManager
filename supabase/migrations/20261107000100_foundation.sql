-- =============================================================================
-- ProManager — Stage 1: foundation
-- Extensions, private schema, enums, shared trigger helpers, reference data.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- The private schema is NOT exposed through the Data API (PostgREST).
-- It holds SECURITY DEFINER helpers used by RLS policies and internal tables.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.org_role as enum ('owner', 'admin', 'manager', 'accountant', 'employee', 'viewer');
create type public.member_status as enum ('active', 'invited', 'suspended');
create type public.app_locale as enum ('ro', 'ru', 'en');
create type public.onboarding_step as enum ('company', 'regional', 'team', 'customer', 'project', 'completed');

-- -----------------------------------------------------------------------------
-- Reference data: currencies (shared, read-only for clients)
-- -----------------------------------------------------------------------------
create table public.currencies (
  code char(3) primary key check (code ~ '^[A-Z]{3}$'),
  name text not null,
  minor_units smallint not null default 2 check (minor_units between 0 and 4),
  is_active boolean not null default true
);

insert into public.currencies (code, name, minor_units) values
  ('MDL', 'Moldovan leu', 2),
  ('RON', 'Romanian leu', 2),
  ('EUR', 'Euro', 2);

alter table public.currencies enable row level security;
create policy "currencies are readable by everyone"
  on public.currencies for select to anon, authenticated using (true);

-- -----------------------------------------------------------------------------
-- Shared trigger: updated_at maintenance
-- -----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Prevents changing organization_id on any tenant-owned row (tenant hopping).
create or replace function private.prevent_org_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;
