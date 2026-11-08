-- =============================================================================
-- ProManager — Stage 11: hardening after the Phase 1-2 review
--  1. Plan limits fail closed: canceled / paused / expired-trial organizations
--     fall back to the default (free) plan instead of having no limits.
--  2. Member limit serialised with an advisory lock (no race on parallel joins).
--  3. Restoring a soft-deleted customer / project re-checks the plan limit.
--  4. storage_mb is enforced on document metadata.
--  5. HR documents (entity_type = 'employee') need team.read / team.manage,
--     both on the documents table and in Storage (path "<org>/employee/...").
--  6. Soft-deleted organizations are invisible to every RLS helper, and owners
--     can soft-delete an organization through public.delete_organization().
--  7. Only owners may grant, change or remove the admin role (admins can still
--     step down themselves).
--  8. Regional settings are saved in one transaction.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Effective plan: the live subscription's plan, otherwise the default plan.
-- A trial counts as live only until trial_ends_at.
-- -----------------------------------------------------------------------------
create or replace function private.effective_plan_id(p_organization_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select s.plan_id
      from public.subscriptions s
      where s.organization_id = p_organization_id
        and (
          s.status in ('active', 'past_due')
          or (s.status = 'trialing' and (s.trial_ends_at is null or s.trial_ends_at > now()))
        )
      order by s.created_at desc
      limit 1
    ),
    (select p.id from public.plans p where p.is_default limit 1)
  );
$$;
revoke all on function private.effective_plan_id(uuid) from public;
grant execute on function private.effective_plan_id(uuid) to authenticated, service_role;

-- NULL now only means "this plan sets no value for the key" (unlimited by design).
create or replace function private.plan_limit(p_organization_id uuid, p_key text)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select (p.limits ->> p_key)::int
  from public.plans p
  where p.id = private.effective_plan_id(p_organization_id);
$$;
revoke all on function private.plan_limit(uuid, text) from public;
grant execute on function private.plan_limit(uuid, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Member limit with a per-organization lock.
-- -----------------------------------------------------------------------------
create or replace function private.enforce_member_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit int;
  v_count int;
begin
  if new.status <> 'active' or (tg_op = 'UPDATE' and old.status = 'active') then
    return new;
  end if;
  v_limit := private.plan_limit(new.organization_id, 'max_members');
  if v_limit is null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text || ':organization_members', 0));
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

-- -----------------------------------------------------------------------------
-- 3. Restore (deleted_at → NULL) counts like a new row.
-- private.enforce_row_limit() already excludes the row itself from the count.
-- -----------------------------------------------------------------------------
create trigger customers_enforce_limit_on_restore
  before update of deleted_at on public.customers
  for each row
  when (old.deleted_at is not null and new.deleted_at is null)
  execute function private.enforce_row_limit('max_customers');

create trigger projects_enforce_limit_on_restore
  before update of deleted_at on public.projects
  for each row
  when (old.deleted_at is not null and new.deleted_at is null)
  execute function private.enforce_row_limit('max_projects');

-- -----------------------------------------------------------------------------
-- 4. Storage quota (plans.limits.storage_mb) on document metadata.
-- -----------------------------------------------------------------------------
create or replace function private.enforce_storage_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit_mb int := private.plan_limit(new.organization_id, 'storage_mb');
  v_used bigint;
begin
  if v_limit_mb is null or new.deleted_at is not null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text || ':documents', 0));
  select coalesce(sum(d.size_bytes), 0) into v_used
  from public.documents d
  where d.organization_id = new.organization_id and d.deleted_at is null and d.id <> new.id;
  if v_used + new.size_bytes > v_limit_mb::bigint * 1024 * 1024 then
    raise exception 'storage limit of current plan reached' using errcode = '54000';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_storage_limit() from public;

create trigger documents_enforce_storage_limit
  before insert on public.documents
  for each row execute function private.enforce_storage_limit();

create trigger documents_enforce_storage_limit_on_restore
  before update of deleted_at, size_bytes on public.documents
  for each row
  when (new.deleted_at is null and (old.deleted_at is not null or new.size_bytes > old.size_bytes))
  execute function private.enforce_storage_limit();

-- -----------------------------------------------------------------------------
-- 5. HR documents.
-- Path convention: <organization_id>/<entity>/<uuid>-<name>; HR files live in
-- <organization_id>/employee/... and the metadata row must say so.
-- -----------------------------------------------------------------------------
create or replace function private.document_permission(p_entity_type text, p_action text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_entity_type = 'employee' then case when p_action = 'read' then 'team.read' else 'team.manage' end
    else 'documents.' || p_action
  end;
$$;
grant execute on function private.document_permission(text, text) to authenticated, service_role;

-- Entity type of a storage path ("<org>/<entity>/..."), lower-cased.
create or replace function private.storage_path_entity(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(split_part(p_name, '/', 2));
$$;
grant execute on function private.storage_path_entity(text) to authenticated, service_role;

alter table public.documents
  add constraint documents_hr_path_matches_entity
  check ((coalesce(entity_type, '') = 'employee') = (private.storage_path_entity(storage_path) = 'employee'));

drop policy "documents: select" on public.documents;
drop policy "documents: insert" on public.documents;
drop policy "documents: update" on public.documents;
drop policy "documents: delete" on public.documents;

create policy "documents: select"
  on public.documents for select to authenticated
  using (private.has_permission(organization_id, private.document_permission(entity_type, 'read')));
create policy "documents: insert"
  on public.documents for insert to authenticated
  with check (private.has_permission(organization_id, private.document_permission(entity_type, 'write')));
create policy "documents: update"
  on public.documents for update to authenticated
  using (private.has_permission(organization_id, private.document_permission(entity_type, 'write')))
  with check (private.has_permission(organization_id, private.document_permission(entity_type, 'write')));
create policy "documents: delete"
  on public.documents for delete to authenticated
  using (private.has_permission(organization_id, private.document_permission(entity_type, 'delete')));

drop policy "storage documents: read" on storage.objects;
drop policy "storage documents: upload" on storage.objects;
drop policy "storage documents: delete" on storage.objects;

create policy "storage documents: read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and private.has_permission(private.storage_path_org(name), private.document_permission(private.storage_path_entity(name), 'read'))
  );
create policy "storage documents: upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and private.has_permission(private.storage_path_org(name), private.document_permission(private.storage_path_entity(name), 'write'))
  );
create policy "storage documents: delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and private.has_permission(private.storage_path_org(name), private.document_permission(private.storage_path_entity(name), 'delete'))
  );

-- -----------------------------------------------------------------------------
-- 6. Soft-deleted organizations: no member, permission or role survives.
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
    join public.organizations o on o.id = m.organization_id and o.deleted_at is null
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
    join public.organizations o on o.id = m.organization_id and o.deleted_at is null
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
  join public.organizations o on o.id = m.organization_id and o.deleted_at is null
  where m.organization_id = p_organization_id
    and m.user_id = (select auth.uid())
    and m.status = 'active';
$$;

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
    join public.organizations o on o.id = mine.organization_id and o.deleted_at is null
    join public.organization_members theirs
      on theirs.organization_id = mine.organization_id
    where mine.user_id = (select auth.uid())
      and mine.status = 'active'
      and theirs.user_id = p_user_id
      and theirs.status = 'active'
  );
$$;

-- Owner-only soft delete. The slug stays reserved; data is kept for recovery
-- by an operator (service role) and can be purged by a later retention job.
create or replace function public.delete_organization(p_organization_id uuid, p_confirm_slug text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if private.member_role(p_organization_id) is distinct from 'owner' then
    raise exception 'only an owner can delete the organization' using errcode = '42501';
  end if;
  select o.slug into v_slug from public.organizations o where o.id = p_organization_id for update;
  if v_slug is distinct from lower(trim(p_confirm_slug)) then
    raise exception 'confirmation does not match' using errcode = '22023';
  end if;

  update public.organizations set deleted_at = now() where id = p_organization_id;
  update public.subscriptions set status = 'canceled'
    where organization_id = p_organization_id and status in ('trialing', 'active', 'past_due', 'paused');
  update public.profiles set last_organization_id = null where last_organization_id = p_organization_id;
end;
$$;
revoke all on function public.delete_organization(uuid, text) from public, anon;
grant execute on function public.delete_organization(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Admin role is owner-managed.
-- -----------------------------------------------------------------------------
create or replace function private.guard_member_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := coalesce(new.organization_id, old.organization_id);
  v_actor uuid := (select auth.uid());
  v_actor_role public.org_role;
  v_remaining_owners int;
begin
  -- Service role / migrations (no auth.uid()) are trusted.
  if v_actor is not null then
    v_actor_role := private.member_role(v_org);

    if tg_op in ('INSERT', 'UPDATE') and new.role = 'owner'
       and (tg_op = 'INSERT' or old.role <> 'owner')
       and coalesce(v_actor_role::text, '') <> 'owner'
       -- Bootstrap: the creator becomes the first owner of a brand-new organization.
       and not (
         tg_op = 'INSERT'
         and new.user_id = v_actor
         and exists (select 1 from public.organizations o where o.id = v_org and o.created_by = new.user_id)
         and not exists (select 1 from public.organization_members m where m.organization_id = v_org)
       ) then
      raise exception 'only an owner can grant the owner role' using errcode = '42501';
    end if;

    if tg_op in ('UPDATE', 'DELETE') and old.role = 'owner'
       and coalesce(v_actor_role::text, '') <> 'owner' then
      raise exception 'only an owner can change or remove an owner' using errcode = '42501';
    end if;

    -- Admins: only owners grant the role, and only owners change or remove
    -- another admin (an admin may still step down or leave). Accepting an
    -- invitation is exempt: its role was checked when the invitation was
    -- created (owner-only for admin invitations, see the policy below).
    if coalesce(v_actor_role::text, '') <> 'owner'
       and coalesce(current_setting('promanager.accepting_invitation', true), '') <> 'on' then
      if tg_op in ('INSERT', 'UPDATE') and new.role = 'admin' and (tg_op = 'INSERT' or old.role <> 'admin') then
        raise exception 'only an owner can grant the admin role' using errcode = '42501';
      end if;
      if tg_op in ('UPDATE', 'DELETE') and old.role = 'admin' and old.user_id <> v_actor then
        raise exception 'only an owner can change or remove an admin' using errcode = '42501';
      end if;
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

drop policy "invitations: member managers can create" on public.organization_invitations;
create policy "invitations: member managers can create"
  on public.organization_invitations for insert to authenticated
  with check (
    private.has_permission(organization_id, 'members.manage')
    and invited_by = (select auth.uid())
    and accepted_at is null
    and revoked_at is null
    and (role <> 'admin' or private.member_role(organization_id) = 'owner')
  );

-- accept_invitation marks its own transaction so the admin guard above lets
-- the invitee join with the role the owner/admin chose.
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
     or lower(v_inv.email) <> lower(v_email)
     or not exists (select 1 from public.organizations o where o.id = v_inv.organization_id and o.deleted_at is null) then
    raise exception 'invitation is invalid or expired' using errcode = '22023';
  end if;

  perform set_config('promanager.accepting_invitation', 'on', true);
  insert into public.organization_members (organization_id, user_id, role, status, invited_by)
  values (v_inv.organization_id, v_user, v_inv.role, 'active', v_inv.invited_by)
  on conflict (organization_id, user_id) do update set status = 'active', role = excluded.role;
  perform set_config('promanager.accepting_invitation', '', true);

  update public.organization_invitations set accepted_at = now() where id = v_inv.id;
  update public.profiles set last_organization_id = v_inv.organization_id where id = v_user;

  return v_inv.organization_id;
end;
$$;
revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Regional settings in one transaction (invoker: RLS applies to both rows).
-- -----------------------------------------------------------------------------
create or replace function public.update_regional_settings(
  p_organization_id uuid,
  p_country_code char(2),
  p_currency char(3),
  p_locale public.app_locale,
  p_timezone text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.has_permission(p_organization_id, 'settings.manage') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  update public.organizations
    set country_code = upper(p_country_code)
    where id = p_organization_id;
  update public.organization_settings
    set default_currency = upper(p_currency), default_locale = p_locale, timezone = p_timezone
    where organization_id = p_organization_id;
  if not found then
    raise exception 'organization settings not found' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.update_regional_settings(uuid, char, char, public.app_locale, text) from public, anon;
grant execute on function public.update_regional_settings(uuid, char, char, public.app_locale, text) to authenticated;
