"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { FormAlert, FormField } from "@/components/forms/form-field";
import { useActionForm } from "@/hooks/use-action-form";
import { useI18n } from "@/lib/i18n/client";
import { translateValidationMessage } from "@/lib/validation/messages";
import { actionErrorMessage } from "@/lib/validation/action-messages";
import { CURRENCIES, type CurrencyCode } from "@/config/site";
import { createEmployeeAction, updateEmployeeAction } from "../actions/employee-actions";
import { EMPLOYMENT_TYPES, employeeSchema, type EmployeeInput, type EmploymentType } from "../schemas/employee";

export interface EmployeeFormValues {
  id: string;
  first_name: string;
  last_name: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  employment_type: EmploymentType;
  /** Exact decimal string. */
  hourly_cost: string | null;
  cost_currency: CurrencyCode | null;
  hire_date: string | null;
  user_id: string | null;
  is_active: boolean;
}

/**
 * Create (no `employee`) or edit an employee. `accounts` are organization
 * members that may be linked; accounts linked to other employees are excluded
 * by the caller.
 */
export function EmployeeDialog({
  employee,
  accounts,
  defaultCurrency,
}: {
  employee?: EmployeeFormValues;
  accounts: { userId: string; name: string }[];
  defaultCurrency: CurrencyCode;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const initial: EmployeeInput = {
    firstName: employee?.first_name ?? "",
    lastName: employee?.last_name ?? "",
    position: employee?.position ?? "",
    email: employee?.email ?? "",
    phone: employee?.phone ?? "",
    employmentType: employee?.employment_type ?? "full_time",
    hourlyCost: employee?.hourly_cost ?? "",
    costCurrency: employee?.cost_currency ?? defaultCurrency,
    hireDate: employee?.hire_date ?? "",
    userId: employee?.user_id ?? "none",
    isActive: employee?.is_active ?? true,
  };
  const form = useForm<EmployeeInput>({ resolver: zodResolver(employeeSchema), defaultValues: initial });
  const { submit, pending, formError } = useActionForm(
    form,
    (values) => (employee ? updateEmployeeAction(employee.id, values) : createEmployeeAction(values)),
    {
      onSuccess: () => {
        setOpen(false);
        if (!employee) form.reset(initial);
        toast.success(employee ? t.employees.updated : t.employees.created);
        router.refresh();
      },
    },
  );
  const errors = form.formState.errors;
  const msg = (m?: string) => translateValidationMessage(t, m);
  const fullName = employee ? `${employee.first_name} ${employee.last_name}`.trim() : "";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset(initial);
      }}
    >
      <DialogTrigger asChild>
        {employee ? (
          <Button variant="ghost" size="icon-sm" aria-label={`${t.employees.edit}: ${fullName}`}>
            <Pencil aria-hidden="true" />
          </Button>
        ) : (
          <Button>
            <UserPlus aria-hidden="true" />
            {t.employees.new}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent closeLabel={t.common.close} className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{employee ? t.employees.edit : t.employees.new}</DialogTitle>
          <DialogDescription>{t.employees.formHint}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {formError && !formError.ok && formError.error !== "validation" && formError.error !== "conflict" ? (
            <FormAlert>{actionErrorMessage(t, formError.error)}</FormAlert>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t.employees.firstName} error={msg(errors.firstName?.message)}>
              <Input autoComplete="off" {...form.register("firstName")} />
            </FormField>
            <FormField label={t.employees.lastName} optionalLabel={t.common.optional} error={msg(errors.lastName?.message)}>
              <Input autoComplete="off" {...form.register("lastName")} />
            </FormField>
            <FormField label={t.employees.position} optionalLabel={t.common.optional} error={msg(errors.position?.message)}>
              <Input {...form.register("position")} />
            </FormField>
            <FormField label={t.employees.employmentType} error={msg(errors.employmentType?.message)}>
              <Controller
                control={form.control}
                name="employmentType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EMPLOYMENT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {t.employees.types[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField label={t.employees.email} optionalLabel={t.common.optional} error={msg(errors.email?.message)}>
              <Input type="email" {...form.register("email")} />
            </FormField>
            <FormField label={t.employees.phone} optionalLabel={t.common.optional} error={msg(errors.phone?.message)}>
              <Input type="tel" {...form.register("phone")} />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem_1fr]">
            <FormField label={t.employees.hourlyCost} optionalLabel={t.common.optional} hint={t.employees.hourlyCostHint} error={msg(errors.hourlyCost?.message)}>
              <Input inputMode="decimal" {...form.register("hourlyCost")} />
            </FormField>
            <FormField label={t.employees.currency} error={msg(errors.costCurrency?.message)}>
              <Controller
                control={form.control}
                name="costCurrency"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField label={t.employees.hireDate} optionalLabel={t.common.optional} error={msg(errors.hireDate?.message)}>
              <Input type="date" {...form.register("hireDate")} />
            </FormField>
          </div>
          <FormField label={t.employees.account} hint={t.employees.accountHint} error={msg(errors.userId?.message)}>
            <Controller
              control={form.control}
              name="userId"
              render={({ field }) => (
                <Select value={field.value ?? "none"} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t.employees.noAccount}</SelectItem>
                    {accounts.map((a) => (
                      <SelectItem key={a.userId} value={a.userId}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
          {employee ? (
            <Controller
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Checkbox id={`active-${employee.id}`} checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                  <Label htmlFor={`active-${employee.id}`} className="text-sm font-normal">
                    {t.employees.activeLabel}
                  </Label>
                </div>
              )}
            />
          ) : null}
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
