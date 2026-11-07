"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActionContext } from "@/lib/auth/organization-context";
import { PermissionError } from "@/lib/permissions";
import { fail, mapDatabaseError, ok, validationFailure, type ActionResult } from "@/lib/validation/action-result";
import { customerCreateSchema } from "../schemas/customer";

export async function createCustomerAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getActionContext("customers.write");
    if (!ctx) return fail("unauthenticated");
    const parsed = customerCreateSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const v = parsed.data;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("customers")
      .insert({
        // organization_id comes from the server-validated context, never from the browser.
        organization_id: ctx.organization.id,
        type: v.type,
        name: v.name,
        email: v.email ?? null,
        phone: v.phone ?? null,
        tax_id: v.taxId ?? null,
        preferred_currency: ctx.currency,
        created_by: ctx.user.id,
      })
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    revalidatePath("/dashboard", "layout");
    return ok({ id: data.id });
  } catch (error) {
    if (error instanceof PermissionError) return fail("forbidden");
    throw error;
  }
}
