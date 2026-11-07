import Link from "next/link";
import { Briefcase, Receipt, Users } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";
import { LanguageSwitcher } from "@/features/i18n/components/language-switcher";
import { getI18n } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n";

export default async function MarketingPage() {
  const { t } = await getI18n();
  const features = [
    { icon: Briefcase, title: t.marketing.featureProjectsTitle, body: t.marketing.featureProjectsBody },
    { icon: Receipt, title: t.marketing.featureFinanceTitle, body: t.marketing.featureFinanceBody },
    { icon: Users, title: t.marketing.featureTeamTitle, body: t.marketing.featureTeamBody },
  ];
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-4 py-4 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-1 sm:gap-2">
          <LanguageSwitcher compact />
          <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            {t.marketing.signIn}
          </Link>
          <Link href="/register" className={buttonVariants({ size: "sm" })}>
            {t.marketing.getStarted}
          </Link>
        </nav>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 sm:px-6">
        <section className="py-16 text-center sm:py-24">
          <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">{t.marketing.heroTitle}</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">{t.marketing.heroSubtitle}</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/register" className={buttonVariants({ size: "lg" })}>
              {t.marketing.getStarted}
            </Link>
            <Link href="/login" className={buttonVariants({ variant: "secondary", size: "lg" })}>
              {t.marketing.signIn}
            </Link>
          </div>
        </section>
        <section className="grid gap-4 pb-16 sm:grid-cols-3">
          {features.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-lg border border-border bg-surface p-6 shadow-xs">
              <span className="flex size-10 items-center justify-center rounded-md bg-primary-soft text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <h2 className="mt-4 font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>
      </main>
      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
        {interpolate(t.marketing.footer, { year: new Date().getFullYear() })}
      </footer>
    </div>
  );
}
