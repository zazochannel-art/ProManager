"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { Avatar } from "@/components/ui/avatar";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useI18n } from "@/lib/i18n/client";
import { interpolate } from "@/lib/i18n";
import { formatDate } from "@/lib/utils/dates";
import { actionErrorMessage } from "@/lib/validation/action-messages";
import type { ActionResult } from "@/lib/validation/action-result";
import type { Role } from "@/lib/permissions";
import { revokeInvitationAction, suspendMemberAction, updateMemberRoleAction } from "@/features/organizations/actions/organization-actions";
import type { InvitationRow, MemberRow } from "../services/members-service";

export function MembersPanel({
  members,
  invitations,
  currentUserId,
  canManage,
  assignableRoles,
}: {
  members: MemberRow[];
  invitations: InvitationRow[];
  currentUserId: string;
  canManage: boolean;
  assignableRoles: Role[];
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult>, success: string) {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const result = await action();
        if (result.ok) toast.success(success);
        else toast.error(actionErrorMessage(t, result.error));
        router.refresh();
        resolve();
      });
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t.settings.member}</TableHead>
              <TableHead>{t.settings.role}</TableHead>
              <TableHead>{t.settings.status}</TableHead>
              <TableHead>{t.settings.joined}</TableHead>
              {canManage ? <TableHead className="text-right">{t.common.actions}</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => {
              const isSelf = m.userId === currentUserId;
              // Owners can only be changed by owners (enforced again in the database).
              const editable = canManage && !isSelf && m.status === "active" && assignableRoles.includes(m.role);
              return (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar name={m.name || m.email} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {m.name || m.email} {isSelf ? <span className="text-xs font-normal text-muted-foreground">({t.settings.you})</span> : null}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {editable ? (
                      <Select
                        value={m.role}
                        disabled={pending}
                        onValueChange={(role) => void run(() => updateMemberRoleAction({ memberId: m.id, role }), t.settings.roleUpdated)}
                      >
                        <SelectTrigger className="h-9 w-40" aria-label={t.settings.changeRole}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {assignableRoles.map((r) => (
                            <SelectItem key={r} value={r}>
                              {t.roles[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      t.roles[m.role]
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={m.status === "active" ? "success" : "neutral"}>{(t.settings.statuses as Record<string, string>)[m.status] ?? m.status}</Badge>
                  </TableCell>
                  <TableCell>{formatDate(m.joinedAt, locale)}</TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      {editable ? (
                        <ConfirmDialog
                          trigger={
                            <Button variant="ghost" size="sm" disabled={pending}>
                              {t.settings.suspend}
                            </Button>
                          }
                          title={t.settings.suspendConfirmTitle}
                          description={t.settings.suspendConfirmBody}
                          confirmLabel={t.settings.suspend}
                          cancelLabel={t.common.cancel}
                          onConfirm={() => run(() => suspendMemberAction(m.id), t.settings.memberSuspended)}
                        />
                      ) : null}
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {canManage ? (
        <section>
          <h3 className="mb-3 text-sm font-semibold">{t.settings.invitations}</h3>
          {invitations.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.settings.noInvitations}</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {invitations.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.roles[inv.role]} · {interpolate(t.settings.expires, { date: formatDate(inv.expiresAt, locale) })}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => void run(() => revokeInvitationAction(inv.id), t.settings.invitationRevoked)}>
                    {t.settings.revoke}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
