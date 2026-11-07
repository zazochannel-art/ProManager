# Database

All schema lives in `supabase/migrations/` (applied in filename order). 40
tables in `public`, all with RLS enabled; helper functions and the permission
table live in the non-exposed `private` schema.

| Migration | Contents |
|---|---|
| `…000100_foundation` | extensions, `private` schema, enums, currencies (MDL, RON, EUR), `set_updated_at`, `prevent_org_change` |
| `…000200_tenancy` | profiles, organizations, organization_members, organization_settings, organization_invitations, `private.role_permissions`, RLS helpers, `create_organization()`, `accept_invitation()` |
| `…000300_billing` | plans (catalogue with limits), subscriptions (one live per org), billing_events (webhook idempotency), member limit trigger |
| `…000400_tenant_helpers` | activity_logs (append-only), `private.log_activity()`, `private.setup_tenant_table()` (standard policies) |
| `…000500_crm_projects` | customers, contacts, addresses, projects, project members, project phases, tasks, events, time entries |
| `…000600_team_inventory` | employees, assignments, suppliers, warehouses, inventory items, stock movements (insert-only ledger), stock level view |
| `…000700_finance` | tax_rates, document_sequences, estimates(+items), invoices(+items), payments, payment_allocations, expense categories, expenses, workflow functions, `invoice_overview` view |
| `…000800_documents_notifications` | documents, storage buckets + storage RLS, notifications, preferences, automation rules, client portal access |
| `…000900_reporting` | `dashboard_summary()`, `project_financials()`, `search_organization()` |
| `…001000_plan_limits` | customer/project plan limits, `organization_storage_bytes()` |

## Conventions

- `id uuid default gen_random_uuid()`, `created_at`, `updated_at` (trigger), `deleted_at` for soft delete where history matters.
- Every tenant table: `organization_id not null`, `unique (organization_id, id)`, composite FKs to parents, `prevent_org_change` trigger, indexes leading with `organization_id`.
- Check constraints for formats and ranges (e-mails, codes, non-negative money, date order).
- Money: `numeric(14,2)`; quantities `numeric(14,3)`; rates `numeric(7,4)`.

## RLS helper functions (`private`, SECURITY DEFINER, `search_path = ''`)

| Function | Meaning |
|---|---|
| `is_org_member(org)` | caller has an **active** membership |
| `has_permission(org, perm)` | caller's role in `org` grants `perm` (via `private.role_permissions`) |
| `member_role(org)` | caller's role |
| `shares_org_with(user)` | caller and `user` share an organization (profile visibility) |
| `storage_path_org(name)` | organization id from a storage object path (`<org_id>/…`), NULL if malformed |

`private.setup_tenant_table(table, read, write, delete, audit, has_updated_at)` creates the standard SELECT / INSERT / UPDATE (USING **and** WITH CHECK) / DELETE policies plus triggers, so new tables are protected consistently.

## Financial integrity

- Item tables compute `line_subtotal`, `line_discount`, `line_tax`, `line_total` as **generated columns**; `recalculate_document_totals` updates the parent document.
- Column-level `GRANT`s: `authenticated` cannot write `number`, `status`, totals, `amount_paid`, snapshots.
- Issued invoices are immutable for clients (`guard_invoice_update`, `guard_document_items`); changes go through `void_invoice`.
- `next_document_number(org, type, date)` uses `INSERT … ON CONFLICT DO UPDATE` on `document_sequences` → gap-free, race-free per organization/type/year (`INV-2026-0001`).
- `issue_invoice` sets number, due date (org default), customer and organization snapshots.
- `record_payment(org, customer, amount, currency, method, paid_on, idempotency_key, allocations, …)`: advisory lock per key, returns the existing payment on retry (rejects reuse with different parameters), locks invoices `FOR UPDATE`, rejects currency mismatch, closed/draft invoices, other customers' invoices, over-allocation and overpayment (unless `allow_overpayment`).
- `invoice_overview` (security_invoker) adds `is_overdue`.

## Reporting

`dashboard_summary(org, months)` returns one JSON document: month-to-date revenue (net of discounts, excl. tax, issued invoices), cash collected, expenses, profit inputs, active/completed projects, pending and overdue receivables, a monthly series, recent customers, upcoming tasks and recent activity. It runs as the caller (RLS applies) and refuses non-members.

## Storage

Private buckets, paths always start with the organization id:

| Bucket | Limit | Types | Write permission |
|---|---|---|---|
| `documents` | 25 MB | PDF, images, DOCX, XLSX, CSV | `documents.write` |
| `organization-assets` | 2 MB | PNG, JPEG, WebP | `settings.manage` |

Uploads are validated in the app (size, MIME allow-list, magic bytes) **and** by bucket limits and storage RLS. Files are served with short-lived signed URLs.

## Types

`npm run db:types` regenerates `src/types/database.ts` from a database that has the migrations applied (`DATABASE_URL=postgres://… node scripts/generate-db-types.mjs`). With the Supabase CLI you can use `supabase gen types typescript --local` instead.

## Migration rules

- Never edit a migration that has been applied to production. Add a new one.
- Never disable RLS to "fix" a permission error; fix the policy or the permission.
- Destructive changes (drop/rename) require a two-step migration (expand, migrate data, contract).
- Run `npm run test:integration` after every schema change.

## Local demo data

`supabase/seed.sql` (local only) creates three demo users (password `DemoPassword123`), "Atelier Demo SRL" with customers, projects, tasks, six months of issued invoices, payments and expenses, and a second isolated tenant. All figures are produced by the real database functions.
