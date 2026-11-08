"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { UserMinus, UserPlus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormAlert, FormField } from "@/components/forms/form-field";
import { useActionForm } from "@/hooks/use-action-form";
import { useRunAction } from "@/hooks/use-run-action";
import { useI18n } from "@/lib/i18n/client";
import { translateValidationMessage } from "@/lib/validation/messages";
import { actionErrorMessage } from "@/lib/validation/action-messages";
import { addProjectMemberAction, removeProjectMemberAction, setProjectMemberRoleAction } from "../actions/project-work-actions";
import { PROJECT_MEMBER_ROLES, projectMemberAddSchema, type ProjectMemberAddInput, type ProjectMemberRole } from "../schemas/project-work";

export interface ProjectMemberRow {
  id: string;
  user_id: string;
  project_role: ProjectMemberRole;
}

const ROLE_ORDER: Record<ProjectMemberRole, number> = { lead: 0, member: 1, observer: 2 };

export function ProjectMembers({
  projectId,
  members,
  people,
  active,
  canManage,
}: {
  projectId: string;
  members: ProjectMemberRow[];
  /** Every organization member, for names (including people who left). */
  people: { userId: string; name: string }[];
  /** Active organization members who may be added. */
  active: { userId: string; name: string }[];
  canManage: boolean;
}) {
  const { t } = useI18n();
  const run = useRunAction();
  const nameOf = new Map(people.map((p) => [p.userId, p.name]));
  const inProject = new Set(members.map((m) => m.user_id));
  const candidates = active.filter((p) => !inProject.has(p.userId));
  const sorted = [...members].sort((a, b) => ROLE_ORDER[a.project_role] - ROLE_ORDER[b.project_role]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.projects.members.title}</CardTitle>
        <CardDescription>{t.projects.members.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.projects.members.empty}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {sorted.map((member) => {
              const name = nameOf.get(member.user_id) ?? "—";
              return (
                <li key={member.id} className="flex items-start gap-3">
                  <Avatar name={name} className="mt-0.5 size-8 text-xs" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{name}</p>
                    {canManage ? (
                      <div className="mt-1.5">
                        <RoleSelect projectId={projectId} member={member} name={name} />
                      </div>
                    ) : (
                      <Badge variant={member.project_role === "lead" ? "primary" : "neutral"}>{t.projects.members.roles[member.project_role]}</Badge>
                    )}
                  </div>
                  {canManage ? (
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label={`${t.common.delete}: ${name}`}>
                          <UserMinus aria-hidden="true" />
                        </Button>
                      }
                      title={t.projects.members.removeTitle}
                      description={t.projects.members.removeBody}
                      confirmLabel={t.common.delete}
                      cancelLabel={t.common.cancel}
                      onConfirm={async () => {
                        await run(() => removeProjectMemberAction(projectId, member.id), t.projects.members.removed);
                      }}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {canManage ? (
          candidates.length ? (
            <AddMemberForm projectId={projectId} candidates={candidates} />
          ) : (
            <p className="text-xs text-muted-foreground">{t.projects.members.allAdded}</p>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

function RoleSelect({ projectId, member, name }: { projectId: string; member: ProjectMemberRow; name: string }) {
  const { t } = useI18n();
  const run = useRunAction();
  const [pending, startTransition] = useTransition();
  return (
    <Select
      value={member.project_role}
      disabled={pending}
      onValueChange={(next) => {
        if (next === member.project_role) return;
        startTransition(async () => {
          await run(() => setProjectMemberRoleAction(projectId, member.id, next), t.projects.members.roleChanged);
        });
      }}
    >
      <SelectTrigger className="h-8 w-40" aria-label={`${t.projects.members.role}: ${name}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PROJECT_MEMBER_ROLES.map((r) => (
          <SelectItem key={r} value={r}>
            {t.projects.members.roles[r]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AddMemberForm({ projectId, candidates }: { projectId: string; candidates: { userId: string; name: string }[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const empty: ProjectMemberAddInput = { userId: "", role: "member" };
  const form = useForm<ProjectMemberAddInput>({ resolver: zodResolver(projectMemberAddSchema), defaultValues: empty });
  const { submit, pending, formError } = useActionForm(form, (values) => addProjectMemberAction(projectId, values), {
    onSuccess: () => {
      form.reset(empty);
      toast.success(t.projects.members.added);
      router.refresh();
    },
  });
  const errors = form.formState.errors;
  const msg = (m?: string) => translateValidationMessage(t, m);
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 rounded-md bg-muted/40 p-3">
      {formError && !formError.ok && formError.error !== "validation" && formError.error !== "conflict" ? (
        <FormAlert>{actionErrorMessage(t, formError.error)}</FormAlert>
      ) : null}
      <FormField label={t.projects.members.person} error={msg(errors.userId?.message)}>
        <Controller
          control={form.control}
          name="userId"
          render={({ field }) => (
            <Select value={field.value || undefined} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue placeholder={t.projects.members.choose} />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((c) => (
                  <SelectItem key={c.userId} value={c.userId}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </FormField>
      <FormField label={t.projects.members.role} error={msg(errors.role?.message)}>
        <Controller
          control={form.control}
          name="role"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_MEMBER_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t.projects.members.roles[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </FormField>
      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={pending}>
          <UserPlus aria-hidden="true" />
          {t.projects.members.add}
        </Button>
      </div>
    </form>
  );
}
