"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE } from "@/config/site";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth/session";
import { localeField } from "@/lib/validation/common";
import { fail, mapDatabaseError, ok, type ActionResult } from "@/lib/validation/action-result";

/** Persists the UI language in a cookie and, when signed in, in the profile. */
export async function setLocaleAction(input: unknown): Promise<ActionResult> {
  const parsed = localeField.safeParse(input);
  if (!parsed.success) return fail("validation");

  (await cookies()).set(LOCALE_COOKIE, parsed.data, {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });

  const user = await getAuthUser();
  if (user) {
    const supabase = await createClient();
    const { error } = await supabase.from("profiles").update({ locale: parsed.data }).eq("id", user.id);
    if (error) return fail(mapDatabaseError(error));
  }
  revalidatePath("/", "layout");
  return ok(undefined);
}
