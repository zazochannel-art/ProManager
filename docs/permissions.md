# Permissions

ProManager uses **organization-scoped roles**. A user can belong to several
organizations with a different role in each. The role is stored in
`organization_members.role` and is the **only** source of authorization:
`user_metadata` (editable by the user) is never read for access decisions.

## Two layers, one matrix

| Layer | Where | Purpose |
|---|---|---|
| Database (authority) | `private.role_permissions` + `private.has_permission()` + RLS policies | Enforces every read/write, whatever the client does |
| Application (mirror) | `src/lib/permissions/matrix.ts` | Hides UI the user cannot use; Server Actions fail fast with a clear error |

`tests/integration/permissions-parity.test.ts` fails if the two diverge.
When you change a permission, change **both** (a new migration that updates
`private.role_permissions`, and `matrix.ts`).

## Roles

- **owner**: everything, including billing and granting/removing owners. An organization always keeps at least one active owner (trigger `guard_member_changes`).
- **admin**: everything except billing management and owner changes.
- **manager**: operations (projects, tasks, calendar, estimates, expenses, inventory, client portal) and reads invoices and payments; cannot issue invoices, record payments, manage the team or change settings.
- **accountant**: finance (estimates, invoices, payments, expenses, reports, billing view) and customers; cannot edit projects or manage members.
- **employee**: reads operational data, updates only tasks assigned to them (status only), logs own time. No finance.
- **viewer**: read-only, including financial figures; no writes.

## Matrix

| Permission | owner | admin | manager | accountant | employee | viewer |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| `org.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `org.update` | ✓ | ✓ |  |  |  |  |
| `members.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `members.manage` | ✓ | ✓ |  |  |  |  |
| `settings.manage` | ✓ | ✓ |  |  |  |  |
| `billing.read` | ✓ | ✓ |  | ✓ |  |  |
| `billing.manage` | ✓ |  |  |  |  |  |
| `dashboard.financials` | ✓ | ✓ | ✓ | ✓ |  | ✓ |
| `customers.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `customers.write` | ✓ | ✓ | ✓ | ✓ |  |  |
| `customers.delete` | ✓ | ✓ |  |  |  |  |
| `projects.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `projects.write` | ✓ | ✓ | ✓ |  |  |  |
| `projects.delete` | ✓ | ✓ |  |  |  |  |
| `tasks.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `tasks.write` | ✓ | ✓ | ✓ |  |  |  |
| `tasks.update_assigned` | ✓ | ✓ | ✓ |  | ✓ |  |
| `calendar.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `calendar.write` | ✓ | ✓ | ✓ |  |  |  |
| `time.read` | ✓ | ✓ | ✓ | ✓ |  |  |
| `time.write_own` | ✓ | ✓ | ✓ |  | ✓ |  |
| `time.manage` | ✓ | ✓ | ✓ |  |  |  |
| `estimates.read` | ✓ | ✓ | ✓ | ✓ |  | ✓ |
| `estimates.write` | ✓ | ✓ | ✓ | ✓ |  |  |
| `estimates.delete` | ✓ | ✓ |  |  |  |  |
| `invoices.read` | ✓ | ✓ | ✓ | ✓ |  | ✓ |
| `invoices.write` | ✓ | ✓ |  | ✓ |  |  |
| `invoices.delete` | ✓ | ✓ |  |  |  |  |
| `payments.read` | ✓ | ✓ | ✓ | ✓ |  | ✓ |
| `payments.write` | ✓ | ✓ |  | ✓ |  |  |
| `expenses.read` | ✓ | ✓ | ✓ | ✓ |  | ✓ |
| `expenses.write` | ✓ | ✓ | ✓ | ✓ |  |  |
| `expenses.delete` | ✓ | ✓ |  |  |  |  |
| `team.read` | ✓ | ✓ | ✓ | ✓ |  |  |
| `team.manage` | ✓ | ✓ |  |  |  |  |
| `inventory.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `inventory.write` | ✓ | ✓ | ✓ |  |  |  |
| `suppliers.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `suppliers.write` | ✓ | ✓ | ✓ | ✓ |  |  |
| `reports.read` | ✓ | ✓ | ✓ | ✓ |  | ✓ |
| `documents.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `documents.write` | ✓ | ✓ | ✓ | ✓ |  |  |
| `documents.delete` | ✓ | ✓ |  |  |  |  |
| `portal.manage` | ✓ | ✓ | ✓ |  |  |  |
| `notifications.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `automation.manage` | ✓ | ✓ |  |  |  |  |
| `activity.read` | ✓ | ✓ |  |  |  |  |

## How a request is authorized

1. **Proxy** (`src/proxy.ts`) refreshes the Supabase session and redirects anonymous users away from `/dashboard` and `/onboarding`.
2. **Page / Server Action** calls `requirePagePermission()` / `getActionContext(permission)`; these resolve the active organization from the `pm_org` cookie **only if the user is an active member** of it (`resolveActiveOrganizationId`).
3. **Database**: every query runs as the signed-in user with RLS. Policies call `private.has_permission(organization_id, '<perm>')`, which joins `organization_members` (active only) with `private.role_permissions`.
4. **Workflow functions** (`issue_invoice`, `record_payment`, `void_payment`, `convert_estimate_to_invoice`, `create_organization`, `accept_invitation`) are `SECURITY DEFINER` and check `has_permission` themselves before acting.

An organization id sent by the browser is therefore never trusted: steps 2 and 3 both validate membership.

## Membership changes

- Members are added **only** through `create_organization()` (creator becomes owner) and `accept_invitation()` (invited, e-mail-verified user). Direct inserts into `organization_members` are refused by RLS.
- Invitations store only a SHA-256 hash of the token; the raw token is in the link. They expire after 7 days, are single-use, can be revoked, and can never grant `owner`.
- Removing a member = suspending (`status = 'suspended'`), which revokes access immediately while keeping history.
- Plan limits (members, customers, projects) are enforced by database triggers (`54000`).
