-- =============================================================================
-- ProManager — Stage 8: documents & storage, client portal, notifications,
-- automation rules.
-- =============================================================================

create type public.notification_channel as enum ('in_app', 'email');

-- Extracts the organization id from a storage path "<org_uuid>/<...>".
-- Returns NULL (never raises) for malformed paths, so policies fail closed.
create or replace function private.storage_path_org(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_first text := split_part(p_name, '/', 1);
begin
  if v_first ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return v_first::uuid;
  end if;
  return null;
end;
$$;
grant execute on function private.storage_path_org(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- documents (metadata for files in Supabase Storage)
-- -----------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  bucket text not null default 'documents' check (bucket in ('documents', 'organization-assets')),
  storage_path text not null,
  file_name text not null check (char_length(file_name) between 1 and 255),
  mime_type text not null check (char_length(mime_type) <= 120),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  checksum_sha256 text check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  entity_type text check (entity_type in ('customer', 'project', 'invoice', 'estimate', 'expense', 'payment', 'employee', 'supplier', 'organization')),
  entity_id uuid,
  project_id uuid,
  customer_id uuid,
  is_client_visible boolean not null default false,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, id),
  unique (bucket, storage_path),
  -- Files must live under the owning organization's folder.
  check (private.storage_path_org(storage_path) = organization_id),
  foreign key (organization_id, project_id) references public.projects (organization_id, id),
  foreign key (organization_id, customer_id) references public.customers (organization_id, id)
);
create index documents_org_entity_idx on public.documents (organization_id, entity_type, entity_id) where deleted_at is null;
create index documents_org_project_idx on public.documents (organization_id, project_id);

alter table public.expenses
  add constraint expenses_receipt_document_fk
  foreign key (organization_id, receipt_document_id) references public.documents (organization_id, id);

select private.setup_tenant_table('documents', 'documents.read', 'documents.write', 'documents.delete');

-- -----------------------------------------------------------------------------
-- Storage buckets and policies
-- Path convention: <organization_id>/<entity>/<uuid>-<sanitized file name>
-- Size and MIME limits are enforced by the bucket AND by the server action.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('documents', 'documents', false, 26214400, array[
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv'
  ]),
  ('organization-assets', 'organization-assets', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "storage documents: read"
  on storage.objects for select to authenticated
  using (bucket_id = 'documents' and private.has_permission(private.storage_path_org(name), 'documents.read'));

create policy "storage documents: upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and private.has_permission(private.storage_path_org(name), 'documents.write'));

create policy "storage documents: delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and private.has_permission(private.storage_path_org(name), 'documents.delete'));

create policy "storage org assets: read"
  on storage.objects for select to authenticated
  using (bucket_id = 'organization-assets' and private.is_org_member(private.storage_path_org(name)));

create policy "storage org assets: upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'organization-assets' and private.has_permission(private.storage_path_org(name), 'settings.manage'));

create policy "storage org assets: replace"
  on storage.objects for update to authenticated
  using (bucket_id = 'organization-assets' and private.has_permission(private.storage_path_org(name), 'settings.manage'))
  with check (bucket_id = 'organization-assets' and private.has_permission(private.storage_path_org(name), 'settings.manage'));

create policy "storage org assets: delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'organization-assets' and private.has_permission(private.storage_path_org(name), 'settings.manage'));

-- -----------------------------------------------------------------------------
-- client_portal_access (magic-link style access for customers; token hashed)
-- -----------------------------------------------------------------------------
create table public.client_portal_access (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  customer_id uuid not null,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  token_hash text not null unique,
  can_view_invoices boolean not null default true,
  can_view_estimates boolean not null default true,
  can_view_projects boolean not null default true,
  can_view_documents boolean not null default false,
  expires_at timestamptz not null default (now() + interval '90 days'),
  revoked_at timestamptz,
  last_accessed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, customer_id) references public.customers (organization_id, id) on delete cascade
);
create index client_portal_access_customer_idx on public.client_portal_access (organization_id, customer_id);

select private.setup_tenant_table('client_portal_access', 'portal.manage', 'portal.manage', 'portal.manage');

-- -----------------------------------------------------------------------------
-- notifications (per recipient)
-- -----------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null,
  type text not null check (type ~ '^[a-z_.]{3,64}$'),
  title text not null check (char_length(title) between 1 and 200),
  body text check (char_length(body) <= 2000),
  -- Only in-app relative links (prevents open redirects / javascript: URLs).
  link_path text check (link_path ~ '^/[A-Za-z0-9/_\-?=&.%]*$' and link_path !~ '^//'),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, user_id) references public.organization_members (organization_id, user_id) on delete cascade
);
create index notifications_user_unread_idx on public.notifications (user_id, organization_id, created_at desc) where read_at is null;

alter table public.notifications enable row level security;
create trigger notifications_prevent_org_change before update on public.notifications
  for each row execute function private.prevent_org_change();

create policy "notifications: recipient can read"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) and private.is_org_member(organization_id));
create policy "notifications: recipient can mark read"
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "notifications: recipient can delete"
  on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Server-side helper to create notifications (used by workflows/triggers).
create or replace function private.notify(
  p_organization_id uuid, p_user_id uuid, p_type text, p_title text, p_body text default null, p_link_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if exists (
    select 1 from public.notification_preferences np
    where np.organization_id = p_organization_id and np.user_id = p_user_id
      and np.channel = 'in_app' and np.event_type = p_type and not np.enabled
  ) then
    return null;
  end if;
  insert into public.notifications (organization_id, user_id, type, title, body, link_path)
  values (p_organization_id, p_user_id, p_type, p_title, p_body, p_link_path)
  returning id into v_id;
  return v_id;
end;
$$;

create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null,
  channel public.notification_channel not null,
  event_type text not null check (event_type ~ '^[a-z_.]{3,64}$'),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id, channel, event_type),
  foreign key (organization_id, user_id) references public.organization_members (organization_id, user_id) on delete cascade
);
revoke all on function private.notify(uuid, uuid, text, text, text, text) from public;

alter table public.notification_preferences enable row level security;
create trigger notification_preferences_set_updated_at before update on public.notification_preferences
  for each row execute function private.set_updated_at();
create trigger notification_preferences_prevent_org_change before update on public.notification_preferences
  for each row execute function private.prevent_org_change();

create policy "notification_preferences: own rows (select)"
  on public.notification_preferences for select to authenticated
  using (user_id = (select auth.uid()) and private.is_org_member(organization_id));
create policy "notification_preferences: own rows (insert)"
  on public.notification_preferences for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_org_member(organization_id));
create policy "notification_preferences: own rows (update)"
  on public.notification_preferences for update to authenticated
  using (user_id = (select auth.uid()) and private.is_org_member(organization_id))
  with check (user_id = (select auth.uid()) and private.is_org_member(organization_id));
create policy "notification_preferences: own rows (delete)"
  on public.notification_preferences for delete to authenticated
  using (user_id = (select auth.uid()));

-- Notify the assignee when a task is assigned to someone else.
create or replace function private.notify_task_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and new.assignee_id is distinct from (select auth.uid()) then
    perform private.notify(new.organization_id, new.assignee_id, 'task.assigned', left(new.title, 200), null, '/dashboard/tasks');
  end if;
  return null;
end;
$$;
revoke all on function private.notify_task_assignment() from public;
create trigger tasks_notify_assignment after insert or update of assignee_id on public.tasks
  for each row execute function private.notify_task_assignment();

-- -----------------------------------------------------------------------------
-- automation_rules (definitions only; the executor ships in a later phase)
-- -----------------------------------------------------------------------------
create table public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  trigger_event text not null check (trigger_event ~ '^[a-z_.]{3,64}$'),
  conditions jsonb not null default '{}'::jsonb check (jsonb_typeof(conditions) = 'object'),
  actions jsonb not null default '[]'::jsonb check (jsonb_typeof(actions) = 'array'),
  is_active boolean not null default false,
  last_run_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create index automation_rules_org_trigger_idx on public.automation_rules (organization_id, trigger_event) where is_active;

select private.setup_tenant_table('automation_rules', 'automation.manage', 'automation.manage', 'automation.manage');
