import { z } from "zod";
import { currencyField, dateField, moneyField, optionalText, requiredText } from "@/lib/validation/common";

const normalize = (v: string) => v.trim().replace(",", ".");

/** "none" (the picker's empty choice) and "" become undefined; anything else must be a uuid. */
const optionalReference = z
  .string()
  .optional()
  .transform((v) => (v && v !== "none" ? v : undefined))
  .pipe(z.uuid({ error: "invalidOption" }).optional());

const optionalMoney = moneyField.optional().transform((v) => (v ? v : undefined));

/** Quantity with up to 3 decimals (numeric(14,3)). */
const quantityPattern = /^\d{1,11}(\.\d{1,3})?$/;

export const itemSchema = z.object({
  name: requiredText(1, 200),
  sku: optionalText(64),
  unit: requiredText(1, 16),
  description: optionalText(5000),
  unitCost: optionalMoney,
  salePrice: optionalMoney,
  currency: currencyField,
  reorderLevel: z
    .string()
    .optional()
    .transform((v) => (v === undefined || normalize(v) === "" ? undefined : normalize(v)))
    .refine((v) => v === undefined || quantityPattern.test(v), { error: "quantity" }),
  supplierId: optionalReference,
});
export type ItemInput = z.input<typeof itemSchema>;
export type ItemValues = z.output<typeof itemSchema>;

/** What a user can record by hand; transfers between warehouses come later. */
export const MOVEMENT_KINDS = ["receipt", "issue", "return", "adjustment"] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

/** Every type in public.stock_movement_type, for showing the history. */
export const MOVEMENT_TYPES = ["receipt", "issue", "adjustment", "transfer_in", "transfer_out", "return"] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const movementSchema = z
  .object({
    kind: z.enum(MOVEMENT_KINDS, { error: "invalidOption" }),
    /** Always positive; for an adjustment the direction says whether stock goes up or down. */
    quantity: z
      .string({ error: "required" })
      .transform(normalize)
      .refine((v) => v !== "", { error: "required" })
      .refine((v) => v === "" || (quantityPattern.test(v) && Number(v) > 0), { error: "quantity" }),
    direction: z.enum(["in", "out"]).default("in"),
    unitCost: optionalMoney,
    projectId: optionalReference,
    occurredOn: dateField.refine((v) => v !== "", { error: "required" }),
    reference: optionalText(120),
    notes: optionalText(2000),
  })
  .transform((v) => ({
    ...v,
    // A cost only makes sense for goods coming in; a project only for goods going out or back.
    unitCost: v.kind === "receipt" ? v.unitCost : undefined,
    projectId: v.kind === "issue" || v.kind === "return" ? v.projectId : undefined,
  }));
export type MovementInput = z.input<typeof movementSchema>;
export type MovementValues = z.output<typeof movementSchema>;

/** Signed quantity as stored: issues are negative, adjustments follow the direction. */
export function signedQuantity(v: Pick<MovementValues, "kind" | "quantity" | "direction">): string {
  const out = v.kind === "issue" || (v.kind === "adjustment" && v.direction === "out");
  return out ? `-${v.quantity}` : v.quantity;
}

/** True when stock is at or below the reorder level (no level means never low). */
export function isLowStock(onHand: string, reorderLevel: string | null): boolean {
  if (reorderLevel === null || reorderLevel === undefined) return false;
  return Number(onHand) <= Number(reorderLevel);
}
