-- =============================================================================
-- ProManager — Stage 10: plan limits for customers and projects
-- Limits come from plans.limits (data, not code). Enforced in the database so
-- no client can bypass them. A transaction-scoped advisory lock per
-- (organization, table) serialises concurrent inserts, so two parallel
-- requests cannot both slip under the limit.
-- =============================================================================

create or replace function private.enforce_row_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit_key text := tg_argv[0];
  v_limit int := private.plan_limit(new.organization_id, v_limit_key);
  v_count int;
begin
  if v_limit is null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text || ':' || tg_table_name, 0));
  execute format(
    'select count(*) from public.%I where organization_id = $1 and deleted_at is null and id <> $2',
    tg_table_name
  ) into v_count using new.organization_id, new.id;
  if v_count >= v_limit then
    raise exception '% limit of current plan reached', v_limit_key using errcode = '54000';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_row_limit() from public;

create trigger customers_enforce_limit
  before insert on public.customers
  for each row execute function private.enforce_row_limit('max_customers');

create trigger projects_enforce_limit
  before insert on public.projects
  for each row execute function private.enforce_row_limit('max_projects');

-- Storage usage for the subscription page (invoker: RLS on documents applies).
create or replace function public.organization_storage_bytes(p_organization_id uuid)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(d.size_bytes), 0)::bigint
  from public.documents d
  where d.organization_id = p_organization_id and d.deleted_at is null;
$$;
revoke all on function public.organization_storage_bytes(uuid) from public, anon;
grant execute on function public.organization_storage_bytes(uuid) to authenticated;
