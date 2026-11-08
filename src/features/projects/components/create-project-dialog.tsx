"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n/client";
import type { CurrencyCode } from "@/config/site";
import { ProjectForm } from "./project-form";

export function CreateProjectDialog({
  customers,
  defaultCurrency,
  defaultCustomerId,
  label,
}: {
  customers: { id: string; name: string }[];
  defaultCurrency: CurrencyCode;
  defaultCustomerId?: string;
  label?: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden="true" />
          {label ?? t.projects.new}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={t.common.close} className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t.projects.new}</DialogTitle>
          <DialogDescription>{t.projects.description}</DialogDescription>
        </DialogHeader>
        <ProjectForm
          customers={customers}
          defaultCurrency={defaultCurrency}
          defaultCustomerId={defaultCustomerId}
          onSuccess={() => {
            setOpen(false);
            toast.success(t.projects.created);
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
