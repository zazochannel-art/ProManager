"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActionContext } from "@/lib/auth/organization-context";
import { PermissionError } from "@/lib/permissions";
import { fail, mapDatabaseError, ok, validationFailure, type ActionResult } from "@/lib/validation/action-result";
import { projectCreateSchema } from "../schemas/project";

export async function createProjectAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getActionContext("projects.write");
    if (!ctx) return fail("unauthenticated");
    const parsed = projectCreateSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const v = parsed.data;

    const supabase = await createClient();
    // A customer id from the browser is only a reference; the composite FK
    // (organization_id, customer_id) rejects ids from another organization.
    const { data, error } = await supabase
      .from("projects")
      .insert({
        organization_id: ctx.organization.id,
        name: v.name,
        code: v.code ?? null,
        customer_id: v.customerId ?? null,
        status: v.status,
        start_date: v.startDate ?? null,
        end_date: v.endDate ?? null,
        // NUMERIC column: the exact decimal string is sent as-is (no float conversion).
        budget_amount: v.budget ?? null,
        currency: v.currency,
        manager_user_id: ctx.user.id,
        created_by: ctx.user.id,
      })
      .select("id")
      .single();
    if (error) {
      const code = mapDatabaseError(error);
      if (code === "conflict") return fail("conflict", { fieldErrors: { code: "conflict" } });
      return fail(code);
    }
    revalidatePath("/dashboard", "layout");
    return ok({ id: data.id });
  } catch (error) {
    if (error instanceof PermissionError) return fail("forbidden");
    throw error;
  }
}
