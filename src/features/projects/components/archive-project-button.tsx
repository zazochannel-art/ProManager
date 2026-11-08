"use client";

import { Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useRunAction } from "@/hooks/use-run-action";
import { useI18n } from "@/lib/i18n/client";
import { archiveProjectAction } from "../actions/project-actions";

export function ArchiveProjectButton({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const run = useRunAction();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost">
          <Archive aria-hidden="true" />
          {t.projects.archive}
        </Button>
      }
      title={t.projects.archiveTitle}
      description={t.projects.archiveBody}
      confirmLabel={t.projects.archive}
      cancelLabel={t.common.cancel}
      onConfirm={async () => {
        await run(() => archiveProjectAction(projectId), t.projects.archived, { redirectTo: "/dashboard/projects" });
      }}
    />
  );
}
