-- Remove stale prototype database objects before creating the ProManager schema.
-- The old tables were confirmed empty before this migration was applied.

DO $guard$
DECLARE
  legacy_table text;
  existing_rows bigint;
BEGIN
  FOREACH legacy_table IN ARRAY ARRAY[
    'clients','jobs','job_measurements','job_photos','materials','job_materials',
    'payments','expenses','quotes','quote_items','tools','work_sessions',
    'notifications','settings','invoices','push_subscriptions','handovers',
    'job_tasks','team_members','fixed_costs','installments','projects',
    'day_blocks','stair_designs'
  ]
  LOOP
    IF to_regclass('public.' || quote_ident(legacy_table)) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM public.%I', legacy_table)
      INTO existing_rows;
      IF existing_rows > 0 THEN
        RAISE EXCEPTION 'Refusing to remove non-empty public.%', legacy_table;
      END IF;
    END IF;
  END LOOP;
END
$guard$;

DO $cleanup$
DECLARE
  legacy_job_id bigint;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    FOR legacy_job_id IN EXECUTE
      'SELECT jobid FROM cron.job WHERE jobname = $1'
      USING 'montajpro-reminders'
    LOOP
      EXECUTE 'SELECT cron.unschedule($1)' USING legacy_job_id;
    END LOOP;
  END IF;
END
$cleanup$;

DROP POLICY IF EXISTS "job photos team insert" ON storage.objects;
DROP POLICY IF EXISTS job_photos_delete_own ON storage.objects;
DROP POLICY IF EXISTS job_photos_insert_own ON storage.objects;
DROP POLICY IF EXISTS job_photos_select_own ON storage.objects;
DROP POLICY IF EXISTS job_photos_select_portfolio ON storage.objects;
DROP POLICY IF EXISTS job_photos_select_shared_job ON storage.objects;
DROP POLICY IF EXISTS job_photos_update_own ON storage.objects;

DROP TABLE IF EXISTS
  public.stair_designs, public.day_blocks, public.installments, public.fixed_costs,
  public.team_members, public.handovers, public.job_tasks, public.push_subscriptions,
  public.invoices, public.settings, public.notifications, public.work_sessions,
  public.tools, public.quote_items, public.quotes, public.expenses, public.payments,
  public.job_materials, public.materials, public.job_photos, public.job_measurements,
  public.jobs, public.clients, public.projects
CASCADE;

DROP FUNCTION IF EXISTS public.accept_quote(text, text, text);
DROP FUNCTION IF EXISTS public.calendar_by_token(text);
DROP FUNCTION IF EXISTS public.due_reminders();
DROP FUNCTION IF EXISTS public.handover_by_token(text);
DROP FUNCTION IF EXISTS public.is_portfolio_photo(text);
DROP FUNCTION IF EXISTS public.is_shared_job_photo(text);
DROP FUNCTION IF EXISTS public.job_by_token(text);
DROP FUNCTION IF EXISTS public.mark_quote_viewed(text);
DROP FUNCTION IF EXISTS public.portfolio_by_token(text);
DROP FUNCTION IF EXISTS public.push_config();
DROP FUNCTION IF EXISTS public.quote_by_token(text);
DROP FUNCTION IF EXISTS public.set_synced_at();
DROP FUNCTION IF EXISTS public.shared_jobs();
DROP FUNCTION IF EXISTS public.shared_open_session(uuid);
DROP FUNCTION IF EXISTS public.shared_photo_add(uuid, text, text);
DROP FUNCTION IF EXISTS public.shared_session_log(uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.shared_session_start(uuid);
DROP FUNCTION IF EXISTS public.shared_session_stop(uuid);
DROP FUNCTION IF EXISTS public.shared_task_set(uuid, boolean);
DROP FUNCTION IF EXISTS public.shared_tasks(uuid);
DROP FUNCTION IF EXISTS public.sign_handover(text, text);
DROP FUNCTION IF EXISTS public.team_accept(uuid);
DROP FUNCTION IF EXISTS public.team_owners();

DELETE FROM supabase_migrations.schema_migrations
WHERE name IN (
  '0001_init','0002_storage','0003_quote_links_invoices_push','0004_cron',
  '0005_restrict_internal_functions','0006_push_config','0007_settings_price_list',
  '0008_handovers','0009_job_tasks','0010_team','0011_who_worked','0012_photo_stamp',
  '0013_stock_usage','0014_follow_up_reminders','0015_fixed_costs','0016_installments',
  '0017_shared_offline','0018_job_archive','0019_quote_viewed','0020_projects',
  '0021_tax_language_reminder','0022_quote_signature','0023_garantie_sursa_pachete',
  '0024_treisprezece','0025_cinci_idei','0026_cinci_noi','0027_zece','0028_stocul_scos',
  '0029_design'
);
