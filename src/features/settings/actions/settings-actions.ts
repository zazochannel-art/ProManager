"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE } from "@/config/site";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth/session";
import { getActionContext } from "@/lib/auth/organization-context";
import { PermissionError } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { logger } from "@/lib/security/logger";
import { UPLOAD_POLICIES, validateUpload } from "@/lib/validation/file";
import { fail, mapDatabaseError, ok, validationFailure, type ActionResult } from "@/lib/validation/action-result";
import { profileSchema } from "../schemas/profile";

const FILE_ERROR_KEYS = {
  empty: "fileEmpty",
  too_large: "fileTooLarge",
  type_not_allowed: "fileType",
  content_mismatch: "fileContent",
} as const;

/** Updates the signed-in user's own profile (RLS: a user can only update their own row). */
export async function updateProfileAction(input: unknown): Promise<ActionResult> {
  const user = await getAuthUser();
  if (!user) return fail("unauthenticated");
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName, locale: parsed.data.locale, timezone: parsed.data.timezone })
    .eq("id", user.id);
  if (error) return fail(mapDatabaseError(error));
  (await cookies()).set(LOCALE_COOKIE, parsed.data.locale, {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
  return ok(undefined);
}

/**
 * Uploads the organization logo to the private `organization-assets` bucket at
 * `<organization_id>/logo.<ext>`. The file is validated here (size, MIME
 * allow-list, magic bytes) and again by the bucket limits and storage RLS.
 */
export async function uploadLogoAction(formData: FormData): Promise<ActionResult<{ path: string }>> {
  try {
    const ctx = await getActionContext("settings.manage");
    if (!ctx) return fail("unauthenticated");
    if (!checkRateLimit("upload", ctx.user.id).allowed) return fail("rate_limited");

    const file = formData.get("file");
    if (!(file instanceof File)) return fail("validation", { fieldErrors: { file: "required" } });
    const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
    const check = validateUpload(file, head, UPLOAD_POLICIES.logo);
    if (!check.ok) return fail("validation", { fieldErrors: { file: FILE_ERROR_KEYS[check.error] } });

    const path = `${ctx.organization.id}/logo.${check.extension}`;
    const supabase = await createClient();
    const { error: uploadError } = await supabase.storage
      .from("organization-assets")
      .upload(path, file, { contentType: check.mimeType, upsert: true, cacheControl: "3600" });
    if (uploadError) {
      logger.warn("logo.upload_failed", { organizationId: ctx.organization.id, message: uploadError.message });
      return fail("server");
    }

    const { error } = await supabase.from("organizations").update({ logo_path: path }).eq("id", ctx.organization.id);
    if (error) return fail(mapDatabaseError(error));
    revalidatePath("/dashboard/settings");
    return ok({ path });
  } catch (error) {
    if (error instanceof PermissionError) return fail("forbidden");
    throw error;
  }
}
