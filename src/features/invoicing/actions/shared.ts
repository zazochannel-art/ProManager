import "server-only";
import { getActionContext, type OrganizationContext } from "@/lib/auth/organization-context";
import { PermissionError, type Permission } from "@/lib/permissions";
import { fail, type ActionResult } from "@/lib/validation/action-result";
import { uuidField } from "@/lib/validation/common";

/**
 * Runs an invoicing action: checks the permission and validates the record
 * ids. RLS, column grants, triggers and the workflow functions remain the
 * authority; this only gives early, typed failures.
 */
export async function withDocumentContext<T>(
  permission: Permission,
  ids: unknown[],
  run: (ctx: OrganizationContext, ids: string[]) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    const ctx = await getActionContext(permission);
    if (!ctx) return fail("unauthenticated");
    const parsed: string[] = [];
    for (const id of ids) {
      const result = uuidField.safeParse(id);
      if (!result.success) return fail("not_found");
      parsed.push(result.data);
    }
    return await run(ctx, parsed);
  } catch (error) {
    if (error instanceof PermissionError) return fail("forbidden");
    throw error;
  }
}
