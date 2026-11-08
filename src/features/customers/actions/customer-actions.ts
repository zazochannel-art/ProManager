"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActionContext } from "@/lib/auth/organization-context";
import { PermissionError } from "@/lib/permissions";
import { fail, mapDatabaseError, ok, validationFailure, type ActionResult } from "@/lib/validation/action-result";
import { addressSchema, contactSchema, customerCreateSchema, customerUpdateSchema } from "../schemas/customer";
import { uuidField } from "@/lib/validation/common";

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

const customerPath = (id: string) => `/dashboard/customers/${id}`;

/** Server-side guard shared by the customer detail actions. */
async function withCustomerContext<T>(
  permission: "customers.write" | "customers.delete",
  customerId: unknown,
  run: (ctx: NonNullable<Awaited<ReturnType<typeof getActionContext>>>, customerId: string) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    const ctx = await getActionContext(permission);
    if (!ctx) return fail("unauthenticated");
    const id = uuidField.safeParse(customerId);
    if (!id.success) return fail("not_found");
    return await run(ctx, id.data);
  } catch (error) {
    if (error instanceof PermissionError) return fail("forbidden");
    throw error;
  }
}

export async function updateCustomerAction(customerId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return withCustomerContext("customers.write", customerId, async (ctx, id) => {
    const parsed = customerUpdateSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const v = parsed.data;
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("customers")
      .update({
        type: v.type,
        name: v.name,
        legal_name: v.legalName ?? null,
        email: v.email ?? null,
        phone: v.phone ?? null,
        tax_id: v.taxId ?? null,
        website: v.website ?? null,
        notes: v.notes ?? null,
      })
      .eq("organization_id", ctx.organization.id)
      .eq("id", id)
      .is("deleted_at", null)
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    revalidatePath(customerPath(id));
    revalidatePath("/dashboard/customers");
    return ok({ id: data.id });
  });
}

/** Soft delete. The database requires customers.delete for it (guard_soft_delete trigger). */
export async function archiveCustomerAction(customerId: string): Promise<ActionResult<{ id: string }>> {
  return withCustomerContext("customers.delete", customerId, async (ctx, id) => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("customers")
      .update({ deleted_at: new Date().toISOString() })
      .eq("organization_id", ctx.organization.id)
      .eq("id", id)
      .is("deleted_at", null)
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    revalidatePath("/dashboard", "layout");
    return ok({ id: data.id });
  });
}

export async function addContactAction(customerId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return withCustomerContext("customers.write", customerId, async (ctx, id) => {
    const parsed = contactSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const v = parsed.data;
    const supabase = await createClient();
    if (v.isPrimary) {
      const { error } = await supabase
        .from("customer_contacts")
        .update({ is_primary: false })
        .eq("organization_id", ctx.organization.id)
        .eq("customer_id", id)
        .eq("is_primary", true);
      if (error) return fail(mapDatabaseError(error));
    }
    // The composite FK (organization_id, customer_id) rejects a customer of another organization.
    const { data, error } = await supabase
      .from("customer_contacts")
      .insert({
        organization_id: ctx.organization.id,
        customer_id: id,
        full_name: v.fullName,
        position: v.position ?? null,
        email: v.email ?? null,
        phone: v.phone ?? null,
        is_primary: v.isPrimary,
      })
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    revalidatePath(customerPath(id));
    return ok({ id: data.id });
  });
}

export async function deleteContactAction(customerId: string, contactId: string): Promise<ActionResult<{ id: string }>> {
  return withCustomerContext("customers.write", customerId, async (ctx, id) => {
    const contact = uuidField.safeParse(contactId);
    if (!contact.success) return fail("not_found");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("customer_contacts")
      .delete()
      .eq("organization_id", ctx.organization.id)
      .eq("customer_id", id)
      .eq("id", contact.data)
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    revalidatePath(customerPath(id));
    return ok({ id: data.id });
  });
}

export async function addAddressAction(customerId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return withCustomerContext("customers.write", customerId, async (ctx, id) => {
    const parsed = addressSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const v = parsed.data;
    const supabase = await createClient();
    if (v.isDefault) {
      const { error } = await supabase
        .from("customer_addresses")
        .update({ is_default: false })
        .eq("organization_id", ctx.organization.id)
        .eq("customer_id", id)
        .eq("type", v.type)
        .eq("is_default", true);
      if (error) return fail(mapDatabaseError(error));
    }
    const { data, error } = await supabase
      .from("customer_addresses")
      .insert({
        organization_id: ctx.organization.id,
        customer_id: id,
        type: v.type,
        line1: v.line1,
        line2: v.line2 ?? null,
        city: v.city ?? null,
        region: v.region ?? null,
        postal_code: v.postalCode ?? null,
        country_code: v.countryCode,
        is_default: v.isDefault,
      })
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    revalidatePath(customerPath(id));
    return ok({ id: data.id });
  });
}

export async function deleteAddressAction(customerId: string, addressId: string): Promise<ActionResult<{ id: string }>> {
  return withCustomerContext("customers.write", customerId, async (ctx, id) => {
    const address = uuidField.safeParse(addressId);
    if (!address.success) return fail("not_found");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("customer_addresses")
      .delete()
      .eq("organization_id", ctx.organization.id)
      .eq("customer_id", id)
      .eq("id", address.data)
      .select("id")
      .single();
    if (error) return fail(mapDatabaseError(error));
    revalidatePath(customerPath(id));
    return ok({ id: data.id });
  });
}
