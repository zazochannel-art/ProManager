"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n/client";
import type { CurrencyCode } from "@/config/site";
import { updateProjectAction } from "../actions/project-actions";
import type { ProjectStatus } from "../schemas/project";
import { ProjectForm } from "./project-form";

export interface EditableProject {
  id: string;
  name: string;
  code: string | null;
  customer_id: string | null;
  status: ProjectStatus;
  start_date: string | null;
  end_date: string | null;
  budget_amount: string | null;
  currency: CurrencyCode;
}

export function EditProjectDialog({ project, customers }: { project: EditableProject; customers: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Pencil aria-hidden="true" />
          {t.projects.edit}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={t.common.close} className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t.projects.editTitle}</DialogTitle>
        </DialogHeader>
        <ProjectForm
          customers={customers}
          defaultCurrency={project.currency}
          initialValues={{
            name: project.name,
            code: project.code ?? "",
            customerId: project.customer_id ?? "none",
            status: project.status,
            startDate: project.start_date ?? "",
            endDate: project.end_date ?? "",
            budget: project.budget_amount ?? "",
            currency: project.currency,
          }}
          action={(values) => updateProjectAction(project.id, values)}
          submitLabel={t.common.save}
          onSuccess={() => {
            setOpen(false);
            toast.success(t.projects.updated);
            router.refresh();
          }}
          secondaryAction={
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
          }
        />
      </DialogContent>
    </Dialog>
  );
}
