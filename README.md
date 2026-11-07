# ProManager

Multi-tenant business management SaaS for service companies in Moldova,
Romania and the EU: customers, projects, tasks, estimates, invoices,
payments, expenses, team, inventory and reporting — in Romanian (default),
Russian and English, with MDL, RON and EUR.

This repository contains **Phase 1 (foundation)** and **Phase 2 (design
system, app shell, onboarding, dashboard)**.

## Quick start (local)

Requirements: Node 20.9+, Docker (for the Supabase local stack).

```bash
npm install
npx supabase start            # starts Postgres, Auth, Storage, Studio, Inbucket
npx supabase db reset         # applies supabase/migrations + supabase/seed.sql
cp .env.example .env.local    # paste the local API URL and publishable key
npm run dev                   # http://localhost:3000
```

Demo login (local seed only): `owner@demo.promanager.local` / `DemoPassword123`
(also `accountant@…` and `other@…`, a separate tenant).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | route type generation + `tsc --noEmit` |
| `npm run lint` | ESLint (Next core-web-vitals + TS, `no-explicit-any`, `no-console`) |
| `npm test` | unit + component tests (Vitest, jsdom) |
| `npm run test:integration` | migrations + RLS + finance tests against a real PostgreSQL (`TEST_DATABASE_URL`) |
| `npm run test:e2e` | Playwright against `next start` (run `npm run build` first) |
| `npm run db:types` | regenerate `src/types/database.ts` from a migrated database (`DATABASE_URL`) |
| `npm run check` | typecheck + lint + unit tests |

Integration tests create a throw-away database on the server in
`TEST_DATABASE_URL` (default `postgres://postgres:postgres@localhost:5432/postgres`),
apply `tests/integration/supabase-shim.sql` (auth/storage stand-ins) plus every
migration, and drop it afterwards. If the server is unreachable the suites are
reported as **skipped**, never as passed. You can also point them at the
Supabase local database (`postgres://postgres:postgres@127.0.0.1:54322/postgres`).

E2E: `npx playwright install chromium` once, or set `PLAYWRIGHT_CHROMIUM_PATH`
to an existing Chromium binary.

## What is implemented

- **Auth**: registration (with e-mail confirmation), login, logout, forgot/reset password, e-mail link handler, protected routes (proxy + server checks), rate limiting, no account enumeration.
- **Organizations**: creation, multiple organizations per user with switcher, roles (owner, admin, manager, accountant, employee, viewer), invitations (hashed tokens, verified e-mail match), role changes, suspension, plan limits.
- **Database**: 40 tables with RLS, composite tenant FKs, audit log, financial workflows (numbering, issuing, idempotent payments, voids), storage buckets with RLS, reporting functions.
- **Design system & shell**: Light Premium tokens, accessible Radix-based components, responsive sidebar/drawer navigation for 17 modules (permission-aware), global search (Ctrl/Cmd K), notification center, organization switcher, language switcher, user menu.
- **Onboarding**: 6 resumable steps (organization → company details → regional settings → invite team → first customer → first project); progress is stored in the database.
- **Dashboard**: revenue, expenses, profit and margin, cash collected, active/completed projects, pending and overdue invoices, 6-month chart, recent customers, upcoming tasks, recent activity — all from `dashboard_summary()`; financial cards hidden for roles without `dashboard.financials`.
- **Screens**: customers and projects (list + create), notifications, settings (organization + logo upload, regional, members & invitations, profile), subscription & usage, invitation acceptance, 403/404/error pages.
- Modules whose screens come in later phases display an honest "planned" page.

## Documentation

- [docs/architecture.md](docs/architecture.md): structure, request flow, money, i18n, design system
- [docs/database.md](docs/database.md): migrations, RLS helpers, financial integrity, storage
- [docs/permissions.md](docs/permissions.md): roles and the full permission matrix
- [docs/security.md](docs/security.md): threat model, rules, known limitations
- [docs/deployment.md](docs/deployment.md): Supabase and hosting setup, go-live checklist
