import { z } from "zod";
import { optionalEmail, optionalText, requiredText } from "@/lib/validation/common";

export const customerCreateSchema = z.object({
  type: z.enum(["company", "individual"], { error: "invalidOption" }),
  name: requiredText(1, 200),
  email: optionalEmail,
  phone: optionalText(40),
  taxId: optionalText(40),
});

export type CustomerCreateInput = z.input<typeof customerCreateSchema>;
