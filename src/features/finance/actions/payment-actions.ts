"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fail, mapDatabaseError, ok, validationFailure, type ActionResult } from "@/lib/validation/action-result";
import { withDocumentContext } from "@/features/invoicing/actions/shared";
import { voidSchema } from "@/features/invoicing/schemas/document";

/**
 * Voids a payment from the payments list. void_payment() (payments.write)
 * keeps the row for the audit trail and reopens the balance of every
 * invoice it was allocated to.
 */
export async function voidPaymentFromListAction(paymentId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return withDocumentContext("payments.write", [paymentId], async (_ctx, [id]) => {
    const parsed = voidSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const supabase = await createClient();
    const { error } = await supabase.rpc("void_payment", { p_payment_id: id!, p_reason: parsed.data.reason });
    if (error) return fail(mapDatabaseError(error));
    revalidatePath("/dashboard", "layout");
    return ok({ id: id! });
  });
}
