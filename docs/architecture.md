# Architecture

ProManager is a multi-tenant SaaS for service companies (Moldova, Romania, EU).
This document covers the foundation delivered in Phases 1–2.

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router, React 19, Server Components, Server Actions), TypeScript strict |
| Data / auth / files | Supabase: Postgres + RLS, Auth, Storage, via `@supabase/ssr` (cookie sessions) |
| UI | Tailwind CSS v4 tokens, Radix primitives (`radix-ui`) wrapped shadcn-style in `src/components/ui`, Lucide icons, Sonner toasts |
| Forms | React Hook Form + Zod 4 (same schema on client and server) |
| Tables / charts | TanStack Table v9, Recharts 3 |
| Tests | Vitest + React Testing Library (unit), Vitest + `pg` against real Postgres (integration/RLS), Playwright (e2e) |

## Folder structure

```
src/
  app/                    routes only (thin): layouts, pages, route handlers
    (marketing)/          public landing page
    (auth)/               login, register, forgot/reset password, verify e-mail, invite, portal
    auth/confirm/         e-mail link handler (token_hash → verifyOtp)
    onboarding/           resumable setup wizard
    dashboard/            authenticated app shell + modules
    api/health/           liveness probe
  components/
    ui/                   design-system primitives (button, input, dialog, …)
    shared/               composed building blocks (page header, empty state, stat card, …)
    layout/               app shell: sidebar, topbar, search, notifications, org switcher
    forms/ data-table/ charts/
  features/<module>/      feature code: schemas/ (Zod), services/ (server queries),
                          actions/ (Server Actions), components/ (client UI)
  lib/
    supabase/             browser, server, admin (secret key, server-only) clients + proxy session refresh
    auth/                 session (getClaims), organization context, route rules
    permissions/          role → permission matrix (mirrors the database)
    calculations/         exact decimal math, document totals, payments, profitability
    validation/           shared Zod fields, ActionResult, upload validation
    i18n/                 typed dictionaries ro (reference) / ru / en
    security/             rate limiting, redacting logger, client IP
    currency/ utils/ email/
  config/                 env validation, site constants, navigation
  types/database.ts       generated from the migrations (scripts/generate-db-types.mjs)
supabase/
  migrations/             ordered SQL migrations (schema, RLS, functions)
  seed.sql                local demo data
  templates/              Auth e-mail templates
tests/{unit,integration,e2e}
```

Rules followed throughout:

- **Routes are thin.** Pages call `requireOrganizationContext()` / `requirePagePermission()`, then feature services.
- **Server Actions** validate input with the same Zod schema as the form, re-check permission (`getActionContext`), take the organization id from the server context (never from the browser), and return a typed `ActionResult` (`ok | fail(code, fieldErrors)`). DB errors are mapped to safe codes (`mapDatabaseError`); nothing is swallowed.
- **The database is the authority** for tenancy, permissions and money. The app mirrors rules for UX, never as the only check.

## Request flow

```
Browser ──► proxy.ts (refresh session cookie, redirect anonymous users)
        ──► Server Component / Server Action
              getAuthUser()            supabase.auth.getClaims()  (JWT verified)
              getOrganizationContext() memberships ∩ pm_org cookie hint → active org, role, settings
              requirePagePermission()  role matrix (fail fast)
              supabase.from(...)       runs as the user → RLS enforces tenant + permission
```

`cacheComponents` is intentionally off: every page is per-user and reads cookies, so all app routes are dynamic.

## Multi-tenancy model

- Every tenant table has `organization_id` and `unique (organization_id, id)`.
- Child rows reference parents with **composite foreign keys** `(organization_id, parent_id)`, so a row can never point at another tenant's data, even through a bug.
- `private.prevent_org_change` blocks moving a row to another organization.
- The active organization is chosen per request; the `pm_org` cookie is only a hint validated against active memberships.

See [database.md](database.md) and [permissions.md](permissions.md).

## Money

- Postgres `numeric` everywhere; line math is in **generated columns**, document totals are recomputed by a trigger, and clients have no column privilege to write totals, numbers or statuses.
- TypeScript uses a BigInt fixed-point decimal (`src/lib/calculations/decimal.ts`, rounding half away from zero like PG `round()`); `Numeric` values from the DB (`number | string`) are always read through `dec()`. An integration test checks DB and TS totals are identical.
- Workflows (`issue_invoice`, `record_payment`, `void_payment`, `void_invoice`, `convert_estimate_to_invoice`) are transactional database functions with row locks; payments are idempotent per key.
- VAT/TVA rates are **data** (`tax_rates`, per organization, with validity dates), never constants.
- Dashboard figures come from `public.dashboard_summary()` (one round-trip, RLS applies). Totals are per default currency; documents in other currencies are counted and flagged, not converted.

## Internationalization

Romanian is the default; Russian and English are complete. `ro.ts` is the typed reference (`Dictionary`); the other languages must have the same keys and placeholders (unit-tested). Locale comes from the `pm_locale` cookie (set from the profile or the switcher), then `Accept-Language`. Validation messages are keys (`"minLength:2"`) translated at render time. Dates and money use `Intl` with the organization's time zone.

## Design system ("Light Premium")

Tokens live in `src/app/globals.css` (`@theme inline`): background `#F7F8FA`, surface `#FFFFFF`, foreground `#111827`, muted `#6B7280`, border `#E5E7EB`, primary `#2563EB` / hover `#1D4ED8`, success `#16A34A`, warning `#D97706`, danger `#DC2626`; radii 6 / 10 / 14 / 20 px. Components are accessible Radix primitives with visible focus rings, labelled controls, a skip link, and layouts that work from 360 px wide (mobile nav drawer) to desktop (sticky sidebar).

## Phase status

Implemented screens: landing, auth (register, login, forgot/reset password, e-mail confirmation), onboarding (6 resumable steps), dashboard, customers, projects, notifications, settings (organization + logo, regional, members + invitations, profile), subscription, invitation acceptance.

Modules with database layer and permissions ready but screens planned for later phases show an explicit "planned" page (no fake actions): tasks, calendar, estimates, invoices, payments, expenses, team, inventory, suppliers, reports, client portal.
