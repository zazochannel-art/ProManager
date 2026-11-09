"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActionContext } from "@/lib/auth/organization-context";
import { PermissionError } from "@/lib/permissions";
import { fail, mapDatabaseError, ok, validationFailure, type ActionResult } from "@/lib/validation/action-result";
import { uuidField } from "@/lib/validation/common";
import { employeeSchema } from "../schemas/employee";

function toRow(v: ReturnType<typeof employeeSchema.parse>) {
  return {
    first_name: v.firstName,
    last_name: v.lastName ?? "",
    position: v.position ?? null,
    email: v.email ?? null,
    phone: v.phone ?? null,
    employment_type: v.employmentType,
    // NUMERIC column: the exact decimal string is sent as-is; a currency is required with a rate.
    hourly_cost: v.hourlyCost ?? null,
    cost_currency: v.hourlyCost ? v.costCurrency : null,
    hire_date: v.hireDate ?? null,
    user_id: v.userId ?? null,
    is_active: v.isActive,
  };
}

function conflictOrFail(error: { code?: string; message?: string }) {
  const code = mapDatabaseError(error);
  // unique (organization_id, user_id): the account is already linked to another employee.
  if (code === "conflict") return fail("conflict", { fieldErrors: { userId: "accountLinked" } });
  return fail(code);
}

export async function createEmployeeAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getActionContext("team.manage");
    if (!ctx) return fail("unauthenticated");
    const parsed = employeeSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const supabase = await createClient();
    // FK (organization_id, user_id) → organization_members rejects accounts of other organizations.
    const { data, error } = await supabase
      .from("employees")
      .insert({ organization_id: ctx.organization.id, ...toRow(parsed.data) })
      .select("id")
      .single();
    if (error) return conflictOrFail(error);
    revalidatePath("/dashboard/team");
    return ok({ id: data.id });
  } catch (error) {
    if (error instanceof PermissionError) return fail("forbidden");
    throw error;
  }
}

export async function updateEmployeeAction(employeeId: unknown, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getActionContext("team.manage");
    if (!ctx) return fail("unauthenticated");
    const id = uuidField.safeParse(employeeId);
    if (!id.success) return fail("not_found");
    const parsed = employeeSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("employees")
      .update(toRow(parsed.data))
      .eq("organization_id", ctx.organization.id)
      .eq("id", id.data)
      .is("deleted_at", null)
      .select("id")
      .single();
    if (error) return conflictOrFail(error);
    revalidatePath("/dashboard/team");
    return ok({ id: data.id });
  } catch (error) {
    if (error instanceof PermissionError) return fail("forbidden");
    throw error;
  }
}
