"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { FormAlert, FormField } from "@/components/forms/form-field";
import { useActionForm } from "@/hooks/use-action-form";
import { useI18n } from "@/lib/i18n/client";
import { translateValidationMessage } from "@/lib/validation/messages";
import { actionErrorMessage } from "@/lib/validation/action-messages";
import { createEventAction } from "../actions/event-actions";
import { eventCreateSchema, type EventCreateInput } from "../schemas/event";

type Option = { id: string; name: string };

export function CreateEventDialog({ today, projects, customers }: { today: string; projects: Option[]; customers: Option[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const empty: EventCreateInput = {
    title: "",
    allDay: false,
    startDate: today,
    startTime: "09:00",
    endDate: today,
    endTime: "10:00",
    location: "",
    description: "",
    projectId: "none",
    customerId: "none",
  };
  const form = useForm<EventCreateInput>({ resolver: zodResolver(eventCreateSchema), defaultValues: empty });
  const { submit, pending, formError } = useActionForm(form, (values) => createEventAction(values), {
    onSuccess: () => {
      setOpen(false);
      form.reset(empty);
      toast.success(t.calendar.created);
      router.refresh();
    },
  });
  const errors = form.formState.errors;
  const msg = (m?: string) => translateValidationMessage(t, m);
  const allDay = useWatch({ control: form.control, name: "allDay" });

  const optionSelect = (name: "projectId" | "customerId", options: Option[], noneLabel: string) => (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <Select value={field.value ?? "none"} onValueChange={field.onChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{noneLabel}</SelectItem>
            {options.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <CalendarPlus aria-hidden="true" />
          {t.calendar.new}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={t.common.close} className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t.calendar.new}</DialogTitle>
          <DialogDescription>{t.calendar.newBody}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {formError && !formError.ok && formError.error !== "validation" ? <FormAlert>{actionErrorMessage(t, formError.error)}</FormAlert> : null}
          <FormField label={t.calendar.title_} error={msg(errors.title?.message)}>
            <Input {...form.register("title")} />
          </FormField>
          <Controller
            control={form.control}
            name="allDay"
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox id="event-all-day" checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                <Label htmlFor="event-all-day" className="text-sm font-normal">
                  {t.calendar.allDay}
                </Label>
              </div>
            )}
          />
          <div className="grid gap-4">
            <div className={allDay ? "grid gap-3" : "grid grid-cols-[1fr_9rem] gap-3"}>
              <FormField label={t.calendar.start} error={msg(errors.startDate?.message)}>
                <Input type="date" {...form.register("startDate")} />
              </FormField>
              {allDay ? null : (
                <FormField label={t.calendar.time} error={msg(errors.startTime?.message)}>
                  <Input type="time" {...form.register("startTime")} />
                </FormField>
              )}
            </div>
            <div className={allDay ? "grid gap-3" : "grid grid-cols-[1fr_9rem] gap-3"}>
              <FormField label={t.calendar.end} error={msg(errors.endDate?.message)}>
                <Input type="date" {...form.register("endDate")} />
              </FormField>
              {allDay ? null : (
                <FormField label={t.calendar.time} error={msg(errors.endTime?.message)}>
                  <Input type="time" {...form.register("endTime")} />
                </FormField>
              )}
            </div>
          </div>
          <FormField label={t.calendar.location} optionalLabel={t.common.optional} error={msg(errors.location?.message)}>
            <Input {...form.register("location")} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            {projects.length ? (
              <FormField label={t.calendar.project} optionalLabel={t.common.optional} error={msg(errors.projectId?.message)}>
                {optionSelect("projectId", projects, t.tasks.noProject)}
              </FormField>
            ) : null}
            {customers.length ? (
              <FormField label={t.calendar.customer} optionalLabel={t.common.optional} error={msg(errors.customerId?.message)}>
                {optionSelect("customerId", customers, t.projects.noCustomer)}
              </FormField>
            ) : null}
          </div>
          <FormField label={t.calendar.description_} optionalLabel={t.common.optional} error={msg(errors.description?.message)}>
            <Textarea rows={3} {...form.register("description")} />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" loading={pending}>
              {t.common.save}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
