"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n/client";
import { TaskForm } from "./task-form";

export function CreateTaskDialog({ members, projects }: { members: { userId: string; name: string }[]; projects: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden="true" />
          {t.tasks.new}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={t.common.close}>
        <DialogHeader>
          <DialogTitle>{t.tasks.new}</DialogTitle>
          <DialogDescription>{t.tasks.newBody}</DialogDescription>
        </DialogHeader>
        <TaskForm
          members={members}
          projects={projects}
          onSuccess={() => {
            setOpen(false);
            toast.success(t.tasks.added);
            router.refresh();
          }}
          secondaryAction={
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
          }
        />
      </DialogContent>
    </Dialog>
  );
}
