"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getActionContext } from "@/lib/auth/organization-context";
import { fail, mapDatabaseError, ok, type ActionResult } from "@/lib/validation/action-result";

export type SearchEntityType = "customer" | "project" | "invoice" | "estimate";

export interface SearchResult {
  type: SearchEntityType;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
}

const querySchema = z.string().trim().min(2).max(100);

/** Only modules with screens in this phase get a deep link; others land on the module index. */
function hrefFor(type: SearchEntityType): string {
  switch (type) {
    case "customer":
      return "/dashboard/customers";
    case "project":
      return "/dashboard/projects";
    case "invoice":
      return "/dashboard/invoices";
    case "estimate":
      return "/dashboard/estimates";
  }
}

/** Global search within the ACTIVE organization only (server-validated) — RLS filters further. */
export async function globalSearchAction(query: unknown): Promise<ActionResult<SearchResult[]>> {
  const parsed = querySchema.safeParse(query);
  if (!parsed.success) return ok([]);
  const ctx = await getActionContext();
  if (!ctx) return fail("unauthenticated");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_organization", {
    p_organization_id: ctx.organization.id,
    p_query: parsed.data,
    p_limit: 8,
  });
  if (error) return fail(mapDatabaseError(error));
  return ok(
    (data ?? []).map((row) => {
      const type = row.entity_type as SearchEntityType;
      return { type, id: row.entity_id, title: row.title, subtitle: row.subtitle, href: hrefFor(type) };
    }),
  );
}
