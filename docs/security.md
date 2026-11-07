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

## Known limitations

- The in-memory rate limiter is per instance (see deployment checklist).
- No Content-Security-Policy yet (to be added with known third-party origins).
- Multi-factor authentication is not yet enforced for owners (Supabase MFA can be enabled in a later phase).
- Soft-deleted customers/projects can be restored by users with write permission without re-checking plan limits.
