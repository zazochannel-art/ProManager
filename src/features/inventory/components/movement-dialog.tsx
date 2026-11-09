"use client";

import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { FormAlert, FormField } from "@/components/forms/form-field";
import { useActionForm } from "@/hooks/use-action-form";
import { useI18n } from "@/lib/i18n/client";
import { formatQuantity } from "@/lib/currency/format";
import { interpolate } from "@/lib/i18n";
import { translateValidationMessage } from "@/lib/validation/messages";
import { actionErrorMessage } from "@/lib/validation/action-messages";
import { recordMovementAction } from "../actions/inventory-actions";
import { MOVEMENT_KINDS, movementSchema, type MovementInput, type MovementKind } from "../schemas/inventory";

export interface MovementTarget {
  id: string;
  name: string;
  unit: string;
  on_hand: string;
  unit_cost: string | null;
  currency: string | null;
}

/** Records one stock movement for an item. Opened from the item's row. */
export function MovementDialog({
  item,
  kind,
  projects,
  today,
  onClose,
}: {
  item: MovementTarget;
  kind: MovementKind;
  projects: { id: string; name: string }[];
  today: string;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const form = useForm<MovementInput>({
    resolver: zodResolver(movementSchema) as never,
    defaultValues: { kind, quantity: "", direction: "in", unitCost: kind === "receipt" ? (item.unit_cost ?? "") : "", projectId: "none", occurredOn: today, reference: "", notes: "" },
  });
  const { submit, pending, formError } = useActionForm(form, (values) => recordMovementAction(item.id, values), {
    onSuccess: () => {
      onClose();
      toast.success(t.inventory.movements.recorded);
      router.refresh();
    },
  });
  const errors = form.formState.errors;
  const msg = (m?: string) => translateValidationMessage(t, m);
  const current = useWatch({ control: form.control, name: "kind" }) as MovementKind;

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent closeLabel={t.common.close}>
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
          <DialogDescription>{interpolate(t.inventory.movements.onHand, { quantity: formatQuantity(item.on_hand, locale), unit: item.unit })}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {formError && !formError.ok && formError.error !== "validation" ? <FormAlert>{actionErrorMessage(t, formError.error)}</FormAlert> : null}
          <FormField label={t.inventory.movements.kind} hint={t.inventory.movements.kindHints[current]} error={msg(errors.kind?.message)}>
            <Controller
              control={form.control}
              name="kind"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MOVEMENT_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {t.inventory.movements.kinds[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            {current === "adjustment" ? (
              <FormField label={t.inventory.movements.direction} error={msg(errors.direction?.message)}>
                <Controller
                  control={form.control}
                  name="direction"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="in">{t.inventory.movements.directions.in}</SelectItem>
                        <SelectItem value="out">{t.inventory.movements.directions.out}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
            ) : null}
            <FormField label={`${t.inventory.movements.quantity} (${item.unit})`} error={msg(errors.quantity?.message)}>
              <Input inputMode="decimal" autoFocus {...form.register("quantity")} />
            </FormField>
            {current === "receipt" ? (
              <FormField label={`${t.inventory.fields.unitCost}${item.currency ? ` (${item.currency})` : ""}`} optionalLabel={t.common.optional} hint={t.inventory.movements.costHint} error={msg(errors.unitCost?.message)}>
                <Input inputMode="decimal" {...form.register("unitCost")} />
              </FormField>
            ) : null}
            <FormField label={t.inventory.movements.date} error={msg(errors.occurredOn?.message)}>
              <Input type="date" {...form.register("occurredOn")} />
            </FormField>
          </div>
          {current === "issue" || current === "return" ? (
            <FormField label={t.invoicing.project} optionalLabel={t.common.optional} hint={t.inventory.movements.projectHint} error={msg(errors.projectId?.message)}>
              <Controller
                control={form.control}
                name="projectId"
                render={({ field }) => (
                  <Select value={field.value || "none"} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t.invoicing.noProject}</SelectItem>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
          ) : null}
          <FormField label={t.inventory.movements.reference} optionalLabel={t.common.optional} hint={t.inventory.movements.referenceHint} error={msg(errors.reference?.message)}>
            <Input {...form.register("reference")} />
          </FormField>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>
              {t.common.cancel}
            </Button>
            <Button type="submit" loading={pending}>
              {t.inventory.movements.save}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
