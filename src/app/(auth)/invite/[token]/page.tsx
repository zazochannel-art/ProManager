import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/layout/auth-card";
import { Button } from "@/components/ui/button";
import { getAuthUser } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { AcceptInvitationButton } from "@/features/organizations/components/accept-invitation-button";

export const metadata: Metadata = { title: "Invitation", referrer: "no-referrer", robots: { index: false } };

/**
 * Invitation landing page. The token is only verified (hashed and compared)
 * by `public.accept_invitation` in the database, which also requires the
 * signed-in user's VERIFIED e-mail to match the invited address.
 */
export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const { t } = await getI18n();
  const user = await getAuthUser();
  const next = encodeURIComponent(`/invite/${token}`);
  return (
    <AuthCard title={t.invitation.body}>
      {user ? (
        <AcceptInvitationButton token={token} />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{t.invitation.signInFirst}</p>
          <Button asChild>
            <Link href={`/login?next=${next}`}>{t.auth.signIn}</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/register">{t.auth.createAccount}</Link>
          </Button>
        </div>
      )}
    </AuthCard>
  );
}
