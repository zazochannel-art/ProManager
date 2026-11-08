-- =============================================================================
-- ProManager — Stage 4: tenant table helpers and activity log
-- A single, reviewed implementation of the standard tenant RLS policies, so
-- every business table gets identical SELECT / INSERT / UPDATE / DELETE rules.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- activity_logs (audit trail). Written only by triggers; immutable for clients.
-- Only identifiers and changed column names are recorded — never full row
-- values — so sensitive data does not leak into the log.
-- -----------------------------------------------------------------------------
create table public.activity_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null check (action in ('insert', 'update', 'delete', 'custom')),
  summary text,
  changed_fields text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_logs_org_created_idx on public.activity_logs (organization_id, created_at desc);
create index activity_logs_entity_idx on public.activity_logs (organization_id, entity_type, entity_id);

alter table public.activity_logs enable row level security;
create policy "activity: permitted members can read"
  on public.activity_logs for select to authenticated
  using (private.has_permission(organization_id, 'activity.read'));
-- No INSERT / UPDATE / DELETE policies.

create or replace function private.log_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_org uuid := (v_row ->> 'organization_id')::uuid;
  v_changed text[];
begin
  if v_org is null and tg_table_name = 'organizations' then
    v_org := (v_row ->> 'id')::uuid;
  end if;
  if v_org is null then
    return null;
  end if;
  -- Organization being deleted: nothing to log against.
  if tg_op = 'DELETE' and not exists (select 1 from public.organizations o where o.id = v_org) then
    return null;
  end if;

  if tg_op = 'UPDATE' then
    select array_agg(key order by key) into v_changed
    from jsonb_each(v_new) n
    where n.value is distinct from (v_old -> n.key)
      and n.key not in ('updated_at');
    if v_changed is null then
      return null;
    end if;
  end if;

  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, summary, changed_fields)
  values (
    v_org,
    (select auth.uid()),
    tg_table_name,
    (v_row ->> 'id')::uuid,
    lower(tg_op),
    coalesce(v_row ->> 'number', v_row ->> 'name', v_row ->> 'title'),
    v_changed
  );
  return null;
end;
$$;
revoke all on function private.log_activity() from public;

-- -----------------------------------------------------------------------------
-- private.setup_tenant_table: attaches triggers and the standard policies.
--   read_perm   → SELECT
--   write_perm  → INSERT (WITH CHECK) and UPDATE (USING + WITH CHECK)
--   delete_perm → DELETE
-- Pass NULL for an operation to create no policy (= denied).
-- -----------------------------------------------------------------------------
create or replace function private.setup_tenant_table(
  p_table text,
  p_read_perm text,
  p_write_perm text,
  p_delete_perm text,
  p_audit boolean default true,
  p_has_updated_at boolean default true
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format('alter table public.%I enable row level security', p_table);

  if p_has_updated_at then
    execute format(
      'create trigger %I before update on public.%I for each row execute function private.set_updated_at()',
      p_table || '_set_updated_at', p_table);
  end if;

  execute format(
    'create trigger %I before update on public.%I for each row execute function private.prevent_org_change()',
    p_table || '_prevent_org_change', p_table);

  if p_audit then
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function private.log_activity()',
      p_table || '_activity', p_table);
  end if;

  if p_read_perm is not null then
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.has_permission(organization_id, %L))',
      p_table || ': select', p_table, p_read_perm);
  end if;

  if p_write_perm is not null then
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (private.has_permission(organization_id, %L))',
      p_table || ': insert', p_table, p_write_perm);
    execute format(
      'create policy %I on public.%I for update to authenticated using (private.has_permission(organization_id, %L)) with check (private.has_permission(organization_id, %L))',
      p_table || ': update', p_table, p_write_perm, p_write_perm);
  end if;

  if p_delete_perm is not null then
    execute format(
      'create policy %I on public.%I for delete to authenticated using (private.has_permission(organization_id, %L))',
      p_table || ': delete', p_table, p_delete_perm);
  end if;
end;
$$;
revoke all on function private.setup_tenant_table(text, text, text, text, boolean, boolean) from public;

-- Audit the tenancy tables created in stage 2.
create trigger organizations_activity after update on public.organizations
  for each row execute function private.log_activity();
create trigger organization_members_activity after insert or update or delete on public.organization_members
  for each row execute function private.log_activity();
create trigger organization_settings_activity after update on public.organization_settings
  for each row execute function private.log_activity();
