# Security

## Threat model (summary)

| Threat | Control |
|---|---|
| Tenant A reads or changes tenant B's data | RLS on every table using `private.has_permission`/`is_org_member`; composite FKs; `prevent_org_change`; integration tests per table family |
| Forged organization id from the browser | Active org resolved server-side from memberships; actions never accept an org id; RLS re-checks |
| Privilege escalation via profile metadata | Roles only from `organization_members`; `user_metadata` used only for display defaults (tested) |
| Self-promotion to owner / removing the last owner | `guard_member_changes` trigger (owner-only owner changes, ≥ 1 active owner) |
| Direct membership insertion | No INSERT policy; only `create_organization` and `accept_invitation` (verified e-mail must match) |
| Tampering with invoice totals/status/numbers | Generated columns, totals trigger, column-level grants, immutable issued documents |
| Double payment on retry / race | Idempotency key + advisory lock + `FOR UPDATE` invoice locks |
| Secret key leakage | Secret key read only in `server-only` modules (`src/lib/supabase/admin.ts`, `src/config/server-env.ts`); build output checked for `sb_secret`/`SUPABASE_SECRET_KEY` |
| Session spoofing | `supabase.auth.getClaims()` validates the JWT signature; `getSession()` is never trusted on the server |
| Open redirect after login | `safeRedirectPath` accepts only same-origin relative paths |
| Brute force / abuse | Rate limits on sign-in (IP + e-mail), sign-up, password reset, invitations, uploads; Supabase Auth limits as a second layer |
| User enumeration | Sign-up and password reset return the same response whether or not the e-mail exists |
| Malicious uploads | Size limit, MIME allow-list, magic-byte sniffing, sanitized names, private buckets, storage RLS by path prefix, signed URLs |
| XSS | React escaping; no `dangerouslySetInnerHTML`; e-mail HTML escaped (`escapeHtml`); notification links must be relative paths (DB check) |
| Clickjacking / sniffing | `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy, HSTS |
| Invitation token theft | Only SHA-256 hash stored; 7-day expiry; single use; `no-referrer` on the invite page |
| Sensitive data in logs | `logger` redacts keys matching password/secret/token/key/cookie/session/iban/card and masks e-mails; client errors log only digests |
| SQL injection | Parameterised PostgREST queries; definer functions use `search_path = ''` and `format('%I')`; search escapes `LIKE` wildcards |

## Rules for contributors

- Never disable RLS or add `using (true)` to make something work.
- Never trust an `organization_id` from the client; use `getActionContext()`.
- Never import `src/lib/supabase/admin.ts` outside trusted server code that genuinely needs to bypass RLS (e.g. payment webhooks), and document why.
- Never put secrets in `NEXT_PUBLIC_*` variables or in `.env.example`.
- Never read `user_metadata` for authorization.
- New tenant tables: use `private.setup_tenant_table(...)`, add composite FKs, and extend the integration tests.
- Destructive or financial operations go through database functions with permission checks and locks.

## Hardening (migration 20261108000100)

- **Plan limits fail closed.** `private.effective_plan_id()` uses the live subscription (active, past due, or a trial that has not ended) and otherwise the default plan, so a canceled, paused or expired-trial organization gets Free limits, never "no limits". Restoring a soft-deleted customer or project re-checks the limit; the member limit is serialised with an advisory lock; `storage_mb` is enforced on `documents`.
- **HR documents** (`entity_type = 'employee'`, stored under `<org>/employee/...`) need `team.read` to read and `team.manage` to write or delete, in the table and in Storage. A check constraint keeps the path and the entity type consistent.
- **Admin role is owner-managed.** Only owners grant admin (directly or by invitation) and only owners change, suspend or remove another admin. Admins may step down or leave. `accept_invitation` marks its transaction (`promanager.accepting_invitation`) so an invitee can join with the role chosen by the owner; clients cannot set that flag through the API.
- **Soft-deleted organizations** are invisible to every RLS helper. Owners delete through `public.delete_organization(id, slug)` (Settings → Organization → Danger zone), which also cancels the subscription.
- **Rate limiting** reads the client IP as the N-th X-Forwarded-For entry from the right (`TRUSTED_PROXY_HOPS`, default 1), so client-written entries are ignored. Sign-in is limited per IP + e-mail pair (10/min), per IP (30/min) and per e-mail (100/h), so a stranger cannot lock out a known address.
- **Content-Security-Policy** limits scripts, styles, images and connections to the app and the Supabase project, and forbids framing, plugins and foreign form targets.

## Known limitations

- The in-memory rate limiter is per instance. Running more than one instance needs a shared store (implement `RateLimitStore`, e.g. Upstash Redis).
- The CSP still allows inline scripts (`'unsafe-inline'`) because Next.js injects inline bootstrap scripts; a nonce-based CSP in the proxy is the next step.
- Multi-factor authentication is not yet enforced for owners (Supabase MFA can be enabled in a later phase).
- RLS policies call `private.has_permission()` per row; this should be load-tested on large tables (100k+ rows) before launch.
