-- =============================================================================
-- ProManager — Phase 3: time tracking rules
--
-- Time entries feed project profitability (labour cost = minutes × hourly
-- cost). The cost rate must therefore come from the employee record, not from
-- whoever logs the hours:
--   * duration_minutes is derived from started_at/ended_at when both are set;
--   * on INSERT, a missing hourly_cost is taken from the employee linked to
--     the entry's user (employees.user_id), with its currency;
--   * only time.manage may set or change hourly_cost/cost_currency; anyone
--     else gets the employee rate on insert and keeps the stored rate on
--     update.
-- Service-role/maintenance calls (no auth.uid()) are not restricted.
-- =============================================================================

create or replace function private.apply_time_entry_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_manager boolean := (select auth.uid()) is null or private.has_permission(new.organization_id, 'time.manage');
  v_rate numeric(12, 2);
  v_currency char(3);
begin
  if new.ended_at is not null then
    new.duration_minutes := round(extract(epoch from (new.ended_at - new.started_at)) / 60)::int;
  end if;

  if tg_op = 'UPDATE' and not v_is_manager then
    new.hourly_cost := old.hourly_cost;
    new.cost_currency := old.cost_currency;
    return new;
  end if;

  if tg_op = 'INSERT' and (not v_is_manager or new.hourly_cost is null) then
    select e.hourly_cost, e.cost_currency into v_rate, v_currency
      from public.employees e
     where e.organization_id = new.organization_id
       and e.user_id = new.user_id
       and e.deleted_at is null
     limit 1;
    new.hourly_cost := v_rate;
    new.cost_currency := case when v_rate is null then null else v_currency end;
  end if;
  return new;
end;
$$;
revoke all on function private.apply_time_entry_rules() from public;

create trigger time_entries_apply_rules
  before insert or update on public.time_entries
  for each row execute function private.apply_time_entry_rules();
