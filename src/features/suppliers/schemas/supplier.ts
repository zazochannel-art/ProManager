import { z } from "zod";
import { optionalEmail, optionalText, requiredText } from "@/lib/validation/common";

export const supplierSchema = z.object({
  name: requiredText(1, 200),
  taxId: optionalText(40),
  email: optionalEmail,
  phone: optionalText(40),
  website: optionalText(200),
  address: optionalText(300),
  notes: optionalText(5000),
});
export type SupplierInput = z.input<typeof supplierSchema>;
