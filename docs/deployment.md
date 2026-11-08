# Deployment

## 1. Create the Supabase project

1. Create a project (EU region recommended for MD/RO/EU customers).
2. Apply the migrations:
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push          # applies supabase/migrations in order
   ```
   Do **not** run `supabase/seed.sql` in production (it creates demo users with a public password).
3. Check advisors: Dashboard → Advisors → Security / Performance should show no RLS warnings.

## 2. Configure Auth (Dashboard → Authentication)

| Setting | Value |
|---|---|
| Site URL | `https://app.your-domain.com` |
| Redirect URLs | `https://app.your-domain.com/auth/confirm` |
| Email provider | enabled, **Confirm email = on**, Secure email change = on |
| Password | minimum length **10**, require letters and digits (matches `passwordField`) |
| Leaked password protection | on (Pro plan) |
| Anonymous sign-ins | off |
| SMTP | your own SMTP (the built-in sender is rate-limited and for testing only) |

E-mail templates must link to the app's server-side handler using `token_hash`
(copy from `supabase/templates/*.html`):

| Template | Link |
|---|---|
| Confirm signup | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .Data.signup_next }}` (the app stores where to continue, e.g. an invitation; empty falls back to `/onboarding`) |
| Reset password | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password` |
| Change e-mail | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next=%2Fdashboard%2Fsettings%3Ftab%3Dprofile` |

## 3. Keys and environment

Use the new API keys (Dashboard → Project Settings → API Keys):

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | build + runtime | project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | build + runtime | `sb_publishable_…`, browser-safe |
| `NEXT_PUBLIC_APP_URL` | build + runtime | public base URL, used in e-mail/invitation links |
| `SUPABASE_SECRET_KEY` | runtime, server only | `sb_secret_…`; not needed by Phase 1–2 features; never prefix with `NEXT_PUBLIC_` |
| `TRUSTED_PROXY_HOPS` | runtime, server only | Number of reverse proxies in front of the app (default `1`, right for Vercel or one load balancer; `0` if the app is exposed directly). Used to read the client IP for rate limiting. |
| `RESEND_API_KEY`, `EMAIL_FROM` | runtime, server only | optional; without them invitation links are shown to the admin instead of being e-mailed |

`NEXT_PUBLIC_*` values are inlined at build time, so set them before `next build`.

## 4. Deploy the app

Any Node 20.9+ host works (Vercel, Fly, Render, a container):

```bash
npm ci
npm run check          # typecheck + lint + unit tests
npm run build
npm start              # or the platform's Next.js runtime
```

Health check: `GET /api/health` → `{"status":"ok"}`.

The app sets security headers in `next.config.ts` (HSTS, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy). Add a Content-Security-Policy at the edge once third-party scripts are known.

## 5. Before go-live checklist

- [ ] Migrations applied; `npm run test:integration` green against a staging copy.
- [ ] Auth settings above applied; custom SMTP configured and tested (sign-up, reset, e-mail change).
- [ ] Storage buckets `documents` and `organization-assets` exist and are **private**.
- [ ] Rate limiting: the built-in limiter is per server instance; with several instances, back `RateLimitStore` with a shared store (e.g. Redis) — see `src/lib/security/rate-limit.ts`.
- [ ] Point-in-time recovery / backups enabled on the database.
- [ ] Billing provider webhooks (future phase) write to `billing_events` with the secret key only.
- [ ] Tax rates entered per organization by the customer or accountant (none are hard-coded).

## Local development

```bash
npm install
npx supabase start                       # local stack (Docker)
npx supabase db reset                    # migrations + seed.sql
cp .env.example .env.local               # use the local URL and publishable key printed by `supabase start`
npm run dev
```

Sign in with `owner@demo.promanager.local` / `DemoPassword123`. Local e-mails are visible in Inbucket (http://127.0.0.1:54324).
