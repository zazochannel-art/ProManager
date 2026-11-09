import type { ReactNode } from "react";
import { Clock3, Link2Off, Mail, ShieldAlert, TimerOff } from "lucide-react";
import { LanguageSwitcher } from "@/features/i18n/components/language-switcher";
import type { Dictionary } from "@/lib/i18n";
import { interpolate } from "@/lib/i18n";
import type { Locale } from "@/config/site";
import { formatDate } from "@/lib/utils/dates";
import type { PortalAccess, PortalResolution } from "../services/portal-service";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

/** Customer-facing frame: the company's name on top, the link's validity and contact at the bottom. */
export function PortalShell({ access, t, locale, children }: { access: PortalAccess; t: Dictionary; locale: Locale; children: ReactNode }) {
  const org = access.organization;
  const contact = typeof org.email === "string" && org.email ? org.email : null;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border bg-surface/80 print:hidden">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground" aria-hidden="true">
              {initials(org.name)}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold">{org.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{t.portal.title}</span>
            </span>
          </div>
          <LanguageSwitcher />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      <footer className="mx-auto flex w-full max-w-5xl flex-col gap-1 px-4 pb-8 text-xs text-muted-foreground sm:flex-row sm:justify-between sm:px-6 print:hidden">
        <span className="flex items-center gap-1.5">
          <Clock3 aria-hidden="true" className="size-3.5" />
          {interpolate(t.portal.validTo, { date: formatDate(access.expiresAt.slice(0, 10), locale) })}
        </span>
        {contact ? (
          <a href={`mailto:${contact}`} className="flex items-center gap-1.5 hover:text-primary">
            <Mail aria-hidden="true" className="size-3.5" />
            {interpolate(t.portal.contact, { email: contact })}
          </a>
        ) : null}
      </footer>
    </div>
  );
}

/** Shown instead of the portal when the link is wrong, expired or revoked. */
export function PortalUnavailable({ status, t }: { status: Exclude<PortalResolution["status"], "ok">; t: Dictionary }) {
  const content = {
    invalid: { icon: Link2Off, title: t.portal.invalidTitle, body: t.portal.invalidBody },
    expired: { icon: TimerOff, title: t.portal.expiredTitle, body: t.portal.expiredBody },
    revoked: { icon: ShieldAlert, title: t.portal.revokedTitle, body: t.portal.revokedBody },
    unavailable: { icon: ShieldAlert, title: t.portal.unavailableTitle, body: t.portal.unavailableBody },
  }[status];
  const Icon = content.icon;
  return (
    <div className="flex min-h-dvh items-start justify-center px-4 pt-20 sm:items-center sm:pt-0">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 text-center shadow-sm sm:p-8">
        <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <h1 className="mt-4 text-lg font-semibold tracking-tight">{content.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{content.body}</p>
      </div>
    </div>
  );
}
