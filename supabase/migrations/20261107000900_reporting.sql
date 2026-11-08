-- =============================================================================
-- ProManager — Stage 9: reporting & search functions
-- All functions are SECURITY INVOKER: the caller's RLS decides what is counted.
-- They return raw aggregates; derived metrics (profit, margin) are computed by
-- src/lib/calculations on the server so that logic exists in one place.
-- =============================================================================

create or replace function public.dashboard_summary(p_organization_id uuid, p_months int default 6)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_currency char(3);
  v_tz text;
  v_today date;
  v_month_start date;
  v_series_start date;
  v_result jsonb;
begin
  if not private.is_org_member(p_organization_id) then
    raise exception 'not a member of this organization' using errcode = '42501';
  end if;
  p_months := greatest(1, least(coalesce(p_months, 6), 24));

  select s.default_currency, s.timezone into v_currency, v_tz
  from public.organization_settings s where s.organization_id = p_organization_id;
  v_today := (now() at time zone coalesce(v_tz, 'UTC'))::date;
  v_month_start := date_trunc('month', v_today)::date;
  v_series_start := (date_trunc('month', v_today) - make_interval(months => p_months - 1))::date;

  select jsonb_build_object(
    'currency', v_currency,
    'today', v_today,
    'month_start', v_month_start,

    -- Recognized revenue: net (pre-tax) value of issued invoices in the period.
    'revenue_month', (
      select coalesce(sum(i.subtotal - i.discount_total), 0) from public.invoices i
      where i.organization_id = p_organization_id and i.deleted_at is null
        and i.status in ('issued', 'partially_paid', 'paid')
        and i.currency = v_currency and i.issue_date >= v_month_start and i.issue_date <= v_today),

    -- Cash collected: non-voided payments received in the period.
    'cash_collected_month', (
      select coalesce(sum(p.amount), 0) from public.payments p
      where p.organization_id = p_organization_id and p.voided_at is null
        and p.currency = v_currency and p.paid_on >= v_month_start and p.paid_on <= v_today),

    'expenses_month', (
      select coalesce(sum(e.amount), 0) from public.expenses e
      where e.organization_id = p_organization_id and e.deleted_at is null
        and e.currency = v_currency and e.expense_date >= v_month_start and e.expense_date <= v_today),

    'other_currency_documents_month', (
      select count(*) from public.invoices i
      where i.organization_id = p_organization_id and i.deleted_at is null
        and i.status in ('issued', 'partially_paid', 'paid')
        and i.currency <> v_currency and i.issue_date >= v_month_start and i.issue_date <= v_today),

    'active_projects', (
      select count(*) from public.projects pr
      where pr.organization_id = p_organization_id and pr.deleted_at is null and pr.status = 'active'),

    'completed_projects', (
      select count(*) from public.projects pr
      where pr.organization_id = p_organization_id and pr.deleted_at is null and pr.status = 'completed'),

    'pending_invoices', (
      select jsonb_build_object('count', count(*), 'amount', coalesce(sum(i.balance_due), 0))
      from public.invoices i
      where i.organization_id = p_organization_id and i.deleted_at is null
        and i.status in ('issued', 'partially_paid') and i.currency = v_currency),

    'overdue_invoices', (
      select jsonb_build_object('count', count(*), 'amount', coalesce(sum(i.balance_due), 0))
      from public.invoices i
      where i.organization_id = p_organization_id and i.deleted_at is null
        and i.status in ('issued', 'partially_paid') and i.currency = v_currency
        and i.due_date < v_today),

    -- Month buckets are month-to-date for the current month (future-dated rows excluded),
    -- so the last bar always equals the *_month figures above.
    'monthly', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'month', to_char(m.month_start, 'YYYY-MM'),
        'revenue', coalesce((
          select sum(i.subtotal - i.discount_total) from public.invoices i
          where i.organization_id = p_organization_id and i.deleted_at is null
            and i.status in ('issued', 'partially_paid', 'paid') and i.currency = v_currency
            and i.issue_date >= m.month_start and i.issue_date < (m.month_start + interval '1 month')::date
            and i.issue_date <= v_today), 0),
        'expenses', coalesce((
          select sum(e.amount) from public.expenses e
          where e.organization_id = p_organization_id and e.deleted_at is null and e.currency = v_currency
            and e.expense_date >= m.month_start and e.expense_date < (m.month_start + interval '1 month')::date
            and e.expense_date <= v_today), 0),
        'cash_collected', coalesce((
          select sum(p.amount) from public.payments p
          where p.organization_id = p_organization_id and p.voided_at is null and p.currency = v_currency
            and p.paid_on >= m.month_start and p.paid_on < (m.month_start + interval '1 month')::date
            and p.paid_on <= v_today), 0)
      ) order by m.month_start), '[]'::jsonb)
      from (
        select generate_series(v_series_start, v_month_start, interval '1 month')::date as month_start
      ) m),

    'recent_customers', (
      select coalesce(jsonb_agg(c order by c.created_at desc), '[]'::jsonb) from (
        select c.id, c.name, c.email, c.type, c.created_at from public.customers c
        where c.organization_id = p_organization_id and c.deleted_at is null
        order by c.created_at desc limit 5) c),

    'upcoming_tasks', (
      select coalesce(jsonb_agg(t order by t.due_at nulls last), '[]'::jsonb) from (
        select t.id, t.title, t.status, t.priority, t.due_at, t.project_id, pr.name as project_name
        from public.tasks t
        left join public.projects pr on pr.organization_id = t.organization_id and pr.id = t.project_id
        where t.organization_id = p_organization_id and t.deleted_at is null
          and t.status in ('todo', 'in_progress', 'blocked')
        order by t.due_at nulls last, t.created_at limit 5) t),

    'recent_activity', (
      select coalesce(jsonb_agg(a order by a.created_at desc), '[]'::jsonb) from (
        select a.id, a.entity_type, a.entity_id, a.action, a.summary, a.created_at,
               coalesce(nullif(p.full_name, ''), p.email) as actor_name
        from public.activity_logs a
        left join public.profiles p on p.id = a.actor_id
        where a.organization_id = p_organization_id
        order by a.created_at desc limit 10) a)
  ) into v_result;

  return v_result;
end;
$$;
revoke all on function public.dashboard_summary(uuid, int) from public, anon;
grant execute on function public.dashboard_summary(uuid, int) to authenticated;

-- Raw aggregates for one project, in the project's currency.
create or replace function public.project_financials(p_organization_id uuid, p_project_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with pr as (
    select p.id, p.currency, p.budget_amount from public.projects p
    where p.organization_id = p_organization_id and p.id = p_project_id
  )
  select jsonb_build_object(
    'currency', pr.currency,
    'budget', pr.budget_amount,
    'revenue', (select coalesce(sum(i.subtotal - i.discount_total), 0) from public.invoices i
                where i.organization_id = p_organization_id and i.project_id = pr.id and i.deleted_at is null
                  and i.status in ('issued', 'partially_paid', 'paid') and i.currency = pr.currency),
    'cash_collected', (select coalesce(sum(a.amount), 0) from public.payment_allocations a
                       join public.invoices i on i.organization_id = a.organization_id and i.id = a.invoice_id
                       join public.payments p on p.organization_id = a.organization_id and p.id = a.payment_id
                       where a.organization_id = p_organization_id and i.project_id = pr.id
                         and p.voided_at is null and i.currency = pr.currency),
    'material_costs', (select coalesce(sum(e.amount), 0) from public.expenses e
                       where e.organization_id = p_organization_id and e.project_id = pr.id and e.deleted_at is null
                         and e.currency = pr.currency and e.kind = 'material'),
    'labor_expenses', (select coalesce(sum(e.amount), 0) from public.expenses e
                       where e.organization_id = p_organization_id and e.project_id = pr.id and e.deleted_at is null
                         and e.currency = pr.currency and e.kind in ('labor', 'subcontractor')),
    'labor_time_cost', (select coalesce(sum(round(t.duration_minutes::numeric / 60 * t.hourly_cost, 2)), 0)
                        from public.time_entries t
                        where t.organization_id = p_organization_id and t.project_id = pr.id
                          and t.duration_minutes is not null and t.hourly_cost is not null
                          and t.cost_currency = pr.currency),
    'other_costs', (select coalesce(sum(e.amount), 0) from public.expenses e
                    where e.organization_id = p_organization_id and e.project_id = pr.id and e.deleted_at is null
                      and e.currency = pr.currency and e.kind not in ('material', 'labor', 'subcontractor')),
    'excluded_foreign_currency_items', (
      (select count(*) from public.expenses e
       where e.organization_id = p_organization_id and e.project_id = pr.id and e.deleted_at is null and e.currency <> pr.currency)
      + (select count(*) from public.invoices i
         where i.organization_id = p_organization_id and i.project_id = pr.id and i.deleted_at is null and i.currency <> pr.currency))
  )
  from pr;
$$;
revoke all on function public.project_financials(uuid, uuid) from public, anon;
grant execute on function public.project_financials(uuid, uuid) to authenticated;

-- Global search across the main entities (RLS-filtered).
create or replace function public.search_organization(p_organization_id uuid, p_query text, p_limit int default 20)
returns table (entity_type text, entity_id uuid, title text, subtitle text)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_pattern text;
begin
  if p_query is null or char_length(trim(p_query)) < 2 then
    return;
  end if;
  -- Escape LIKE wildcards supplied by the user.
  v_pattern := '%' || replace(replace(replace(left(trim(p_query), 100), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  p_limit := greatest(1, least(coalesce(p_limit, 20), 50));

  return query
  (select 'customer'::text, c.id, c.name, c.email from public.customers c
   where c.organization_id = p_organization_id and c.deleted_at is null
     and (c.name ilike v_pattern or c.email ilike v_pattern or c.tax_id ilike v_pattern)
   order by c.name limit p_limit)
  union all
  (select 'project'::text, pr.id, pr.name, pr.code from public.projects pr
   where pr.organization_id = p_organization_id and pr.deleted_at is null
     and (pr.name ilike v_pattern or pr.code ilike v_pattern)
   order by pr.name limit p_limit)
  union all
  (select 'invoice'::text, i.id, coalesce(i.number, 'Draft'), i.status::text from public.invoices i
   where i.organization_id = p_organization_id and i.deleted_at is null and i.number ilike v_pattern
   order by i.issue_date desc limit p_limit)
  union all
  (select 'estimate'::text, e.id, coalesce(e.number, ''), e.title from public.estimates e
   where e.organization_id = p_organization_id and e.deleted_at is null
     and (e.number ilike v_pattern or e.title ilike v_pattern)
   order by e.issue_date desc limit p_limit);
end;
$$;
revoke all on function public.search_organization(uuid, text, int) from public, anon;
grant execute on function public.search_organization(uuid, text, int) to authenticated;
