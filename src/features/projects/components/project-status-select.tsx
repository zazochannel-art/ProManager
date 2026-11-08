"use client";

import { useTransition } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRunAction } from "@/hooks/use-run-action";
import { useI18n } from "@/lib/i18n/client";
import { setProjectStatusAction } from "../actions/project-actions";
import { PROJECT_STATUSES, type ProjectStatus } from "../schemas/project";

export function ProjectStatusSelect({ projectId, status }: { projectId: string; status: ProjectStatus }) {
  const { t } = useI18n();
  const run = useRunAction();
  const [pending, startTransition] = useTransition();
  return (
    <Select
      value={status}
      disabled={pending}
      onValueChange={(next) => {
        if (next === status) return;
        startTransition(async () => {
          await run(() => setProjectStatusAction(projectId, next), t.projects.statusChanged);
        });
      }}
    >
      <SelectTrigger className="w-44" aria-label={t.projects.changeStatus}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PROJECT_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {t.projects.statuses[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
