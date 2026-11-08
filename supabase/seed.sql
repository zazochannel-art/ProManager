-- =============================================================================
-- ProManager — LOCAL DEVELOPMENT SEED (demo data only)
--
-- Runs automatically on `supabase db reset` (local stack). NEVER run it against
-- a production project: it creates users with a published demo password.
--
-- Demo sign-ins (local only):
--   owner@demo.promanager.local      / DemoPassword123   (owner, "Atelier Demo SRL")
--   accountant@demo.promanager.local / DemoPassword123   (accountant, same org)
--   other@demo.promanager.local      / DemoPassword123   (owner of a second, isolated org)
--
-- Every financial figure is produced by the same database functions the app
-- uses (generated line totals, recalculation triggers, issue_invoice,
-- record_payment), so the dashboard shows real aggregates, not fixed numbers.
-- Tax rates below are DEMO values for local testing; configure real rates per
-- organization in production (they are never hard-coded in the application).
-- =============================================================================

do $$
declare
  v_owner uuid := '00000000-0000-4000-a000-000000000001';
  v_accountant uuid := '00000000-0000-4000-a000-000000000002';
  v_other uuid := '00000000-0000-4000-a000-000000000003';
  v_password text := extensions.crypt('DemoPassword123', extensions.gen_salt('bf'));
  v_org uuid;
  v_other_org uuid;
  v_c1 uuid; v_c2 uuid; v_c3 uuid; v_c4 uuid;
  v_p1 uuid; v_p2 uuid; v_p3 uuid;
  v_inv uuid;
  v_inv_ids uuid[] := '{}';
  v_cat_material uuid; v_cat_transport uuid;
  v_month int;
  v_issue date;
begin
  if exists (select 1 from auth.users where id = v_owner) then
    raise notice 'Seed already applied, skipping.';
    return;
  end if;

  -- ---------------------------------------------------------------------------
  -- Users (auth.users + identities). handle_new_user() creates the profiles.
  -- ---------------------------------------------------------------------------
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', v_owner, 'authenticated', 'authenticated', 'owner@demo.promanager.local',
     v_password, now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{"full_name":"Ana Demo","locale":"ro"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', v_accountant, 'authenticated', 'authenticated', 'accountant@demo.promanager.local',
     v_password, now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{"full_name":"Ion Contabil","locale":"ro"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', v_other, 'authenticated', 'authenticated', 'other@demo.promanager.local',
     v_password, now(), '', '', '', '', '{"provider":"email","providers":["email"]}', '{"full_name":"Olga Other","locale":"ru"}', now(), now());

  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
  from auth.users u where u.id in (v_owner, v_accountant, v_other);

  -- ---------------------------------------------------------------------------
  -- Organization A, created exactly like the app does (as the owner).
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_owner, 'role', 'authenticated', 'email', 'owner@demo.promanager.local')::text, true);
  v_org := public.create_organization('Atelier Demo SRL', 'atelier-demo', 'MD', 'MDL', 'ro', 'Europe/Chisinau');

  update public.organizations
     set legal_name = 'Atelier Demo SRL', tax_id = '1000000000000', city = 'Chișinău',
         address_line1 = 'str. Exemplu 1', email = 'office@demo.promanager.local'
   where id = v_org;
  update public.organization_settings
     set onboarding_step = 'completed', onboarding_completed_at = now()
   where organization_id = v_org;

  insert into public.organization_members (organization_id, user_id, role, status)
  values (v_org, v_accountant, 'accountant', 'active');

  -- Demo tax rates (labelled as such).
  insert into public.tax_rates (organization_id, name, rate, valid_from, is_default)
  values (v_org, 'Demo standard rate', 20, date '2020-01-01', true),
         (v_org, 'Demo reduced rate', 8, date '2020-01-01', false);

  -- Customers
  insert into public.customers (organization_id, type, name, email, phone, tax_id)
  values (v_org, 'company', 'Construct Plus SRL', 'office@constructplus.example', '+373 22 000 001', '1000000000001')
  returning id into v_c1;
  insert into public.customers (organization_id, type, name, email, phone)
  values (v_org, 'individual', 'Maria Popescu', 'maria@example.com', '+373 69 000 002')
  returning id into v_c2;
  insert into public.customers (organization_id, type, name, email)
  values (v_org, 'company', 'Green Garden SRL', 'contact@greengarden.example')
  returning id into v_c3;
  insert into public.customers (organization_id, type, name)
  values (v_org, 'individual', 'Andrei Rusu')
  returning id into v_c4;

  -- Projects
  insert into public.projects (organization_id, customer_id, code, name, status, start_date, end_date, budget_amount, currency)
  values (v_org, v_c1, 'PRJ-001', 'Office renovation', 'active', current_date - 60, current_date + 30, 85000, 'MDL')
  returning id into v_p1;
  insert into public.projects (organization_id, customer_id, code, name, status, start_date, end_date, budget_amount, currency)
  values (v_org, v_c2, 'PRJ-002', 'Kitchen installation', 'completed', current_date - 120, current_date - 20, 42000, 'MDL')
  returning id into v_p2;
  insert into public.projects (organization_id, customer_id, code, name, status, start_date, budget_amount, currency)
  values (v_org, v_c3, 'PRJ-003', 'Garden irrigation system', 'planned', current_date + 10, 30000, 'MDL')
  returning id into v_p3;

  -- Tasks
  insert into public.tasks (organization_id, project_id, title, status, priority, due_at)
  values (v_org, v_p1, 'Order drywall materials', 'in_progress', 'high', now() + interval '2 days'),
         (v_org, v_p1, 'Electrical inspection', 'todo', 'urgent', now() + interval '5 days'),
         (v_org, v_p3, 'Site survey', 'todo', 'medium', now() + interval '12 days'),
         (v_org, v_p2, 'Final walkthrough', 'done', 'medium', now() - interval '21 days');

  -- Expense categories and expenses over the last months
  insert into public.expense_categories (organization_id, name, kind) values (v_org, 'Materials', 'material') returning id into v_cat_material;
  insert into public.expense_categories (organization_id, name, kind) values (v_org, 'Transport', 'transport') returning id into v_cat_transport;

  for v_month in 0..5 loop
    insert into public.expenses (organization_id, category_id, kind, project_id, description, amount, tax_amount, currency, expense_date, payment_status, paid_on)
    values (v_org, v_cat_material, 'material', case when v_month < 3 then v_p1 else v_p2 end,
            'Building materials, month -' || v_month, 4200 + v_month * 350, 0, 'MDL',
            (date_trunc('month', current_date) - make_interval(months => v_month))::date + 4, 'paid',
            (date_trunc('month', current_date) - make_interval(months => v_month))::date + 4),
           (v_org, v_cat_transport, 'transport', null, 'Fuel and delivery, month -' || v_month, 900 + v_month * 40, 0, 'MDL',
            (date_trunc('month', current_date) - make_interval(months => v_month))::date + 9, 'unpaid', null);
  end loop;

  -- Invoices: one per month, issued through issue_invoice() (numbering + snapshots).
  for v_month in 0..5 loop
    v_issue := (date_trunc('month', current_date) - make_interval(months => v_month))::date + 2;
    insert into public.invoices (organization_id, customer_id, project_id, currency, issue_date, due_date)
    values (v_org, case when v_month % 2 = 0 then v_c1 else v_c2 end, case when v_month % 2 = 0 then v_p1 else v_p2 end,
            'MDL', v_issue, v_issue + 14)
    returning id into v_inv;
    insert into public.invoice_items (organization_id, invoice_id, position, description, unit, quantity, unit_price, discount_percent, tax_rate)
    values (v_org, v_inv, 1, 'Labour', 'h', 40 + v_month * 4, 250, 0, 20),
           (v_org, v_inv, 2, 'Materials', 'pcs', 12, 310.50, 5, 20);
    perform public.issue_invoice(v_inv);
    v_inv_ids := v_inv_ids || v_inv;
  end loop;

  -- Payments: older invoices fully paid, one partially paid, the current one open
  -- (and the month -1 invoice overdue once its due date passes).
  for v_month in 2..5 loop
    perform public.record_payment(
      v_org,
      (select customer_id from public.invoices where id = v_inv_ids[v_month + 1]),
      (select total from public.invoices where id = v_inv_ids[v_month + 1]),
      'MDL', 'bank_transfer',
      (select issue_date + 7 from public.invoices where id = v_inv_ids[v_month + 1]),
      'seed-payment-' || v_month,
      jsonb_build_array(jsonb_build_object('invoice_id', v_inv_ids[v_month + 1],
                                           'amount', (select total from public.invoices where id = v_inv_ids[v_month + 1])))
    );
  end loop;
  perform public.record_payment(
    v_org, v_c2, 5000, 'MDL', 'cash', current_date - 3, 'seed-payment-partial',
    jsonb_build_array(jsonb_build_object('invoice_id', v_inv_ids[2], 'amount', 5000))
  );

  -- A notification for the owner.
  insert into public.notifications (organization_id, user_id, type, title, body, link_path)
  values (v_org, v_owner, 'welcome', 'Welcome to ProManager', 'Demo data was loaded for local development.', '/dashboard');

  -- ---------------------------------------------------------------------------
  -- Organization B — a separate tenant, used to demonstrate isolation.
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_other, 'role', 'authenticated', 'email', 'other@demo.promanager.local')::text, true);
  v_other_org := public.create_organization('Other Company SRL', 'other-company', 'RO', 'RON', 'ru', 'Europe/Bucharest');
  update public.organization_settings set onboarding_step = 'completed', onboarding_completed_at = now() where organization_id = v_other_org;
  insert into public.customers (organization_id, type, name) values (v_other_org, 'company', 'Private Customer of Org B');

  perform set_config('request.jwt.claims', '', true);
end
$$;
