-- =============================================================================
-- ProManager — Phase 3: archiving (soft delete) needs the delete permission
--
-- The generic tenant UPDATE policy only checks the *write* permission, so
-- without this guard anyone allowed to edit a customer or project could also
-- archive or restore it. Archiving is a delete in the UI, so the database now
-- requires the same permission as a hard DELETE (customers.delete,
-- projects.delete). Service-role/maintenance calls (no auth.uid()) are exempt.
-- =============================================================================

create or replace function private.guard_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_permission text := tg_argv[0];
begin
  if new.deleted_at is distinct from old.deleted_at
     and (select auth.uid()) is not null
     and not private.has_permission(new.organization_id, v_permission) then
    raise exception 'archiving requires %', v_permission using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_soft_delete() from public;

create trigger customers_guard_soft_delete
  before update of deleted_at on public.customers
  for each row execute function private.guard_soft_delete('customers.delete');

create trigger projects_guard_soft_delete
  before update of deleted_at on public.projects
  for each row execute function private.guard_soft_delete('projects.delete');
