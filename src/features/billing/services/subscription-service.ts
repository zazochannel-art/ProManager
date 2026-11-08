import "server-only";
import { z } from "zod";
import type { ServerSupabaseClient } from "@/lib/supabase/server";

const limitsSchema = z
  .object({
    max_members: z.number().int().optional(),
    max_projects: z.number().int().optional(),
    max_customers: z.number().int().optional(),
    storage_mb: z.number().int().optional(),
  })
  .passthrough();

export type PlanLimits = z.infer<typeof limitsSchema>;

export interface SubscriptionOverview {
  /** Subscription status, plus the derived "trial_expired" once a trial has ended. */
  status: string;
  /** True when the limits come from the default plan (paused subscription or ended trial), as in the database. */
  usingDefaultPlanLimits: boolean;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  plan: { code: string; name: string; description: string | null; priceAmount: string; priceCurrency: string; interval: string; limits: PlanLimits };
  usage: { members: number; projects: number; customers: number; storageBytes: number };
}

async function countRows(
  supabase: ServerSupabaseClient,
  table: "organization_members" | "projects" | "customers",
  organizationId: string,
): Promise<number> {
  const base = () => supabase.from(table).select("id", { count: "exact", head: true }).eq("organization_id", organizationId);
  const { count, error } =
    table === "organization_members"
      ? await supabase.from("organization_members").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "active")
      : await base().is("deleted_at", null);
  if (error) throw new Error(`Failed to count ${table}: ${error.message}`);
  return count ?? 0;
}

/** Current plan, status and real usage counts for one organization (RLS applies). */
export async function getSubscriptionOverview(supabase: ServerSupabaseClient, organizationId: string): Promise<SubscriptionOverview | null> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("status, trial_ends_at, current_period_end, plans!inner(code, name, description, price_amount, price_currency, billing_interval, limits)")
    .eq("organization_id", organizationId)
    .in("status", ["trialing", "active", "past_due", "paused"])
    .maybeSingle();
  if (error) throw new Error(`Failed to load subscription: ${error.message}`);
  if (!data) return null;

  type PlanRow = {
    code: string;
    name: string;
    description: string | null;
    price_amount: number | string;
    price_currency: string;
    billing_interval: string;
    limits: unknown;
  };
  let plan = data.plans as unknown as PlanRow;

  // Mirrors private.effective_plan_id(): an ended trial or a paused
  // subscription is limited by the default plan.
  const trialExpired = data.status === "trialing" && data.trial_ends_at !== null && new Date(data.trial_ends_at).getTime() <= Date.now();
  const usingDefaultPlanLimits = trialExpired || data.status === "paused";
  if (usingDefaultPlanLimits) {
    const { data: fallback, error: fallbackError } = await supabase
      .from("plans")
      .select("code, name, description, price_amount, price_currency, billing_interval, limits")
      .eq("is_default", true)
      .maybeSingle();
    if (fallbackError) throw new Error(`Failed to load default plan: ${fallbackError.message}`);
    if (fallback) plan = fallback as PlanRow;
  }

  const [members, projects, customers, storage] = await Promise.all([
    countRows(supabase, "organization_members", organizationId),
    countRows(supabase, "projects", organizationId),
    countRows(supabase, "customers", organizationId),
    supabase.rpc("organization_storage_bytes", { p_organization_id: organizationId }),
  ]);
  if (storage.error) throw new Error(`Failed to load storage usage: ${storage.error.message}`);
  const storageBytes = Number(storage.data ?? 0);

  return {
    status: trialExpired ? "trial_expired" : data.status,
    usingDefaultPlanLimits,
    trialEndsAt: data.trial_ends_at,
    currentPeriodEnd: data.current_period_end,
    plan: {
      code: plan.code,
      name: plan.name,
      description: plan.description,
      priceAmount: String(plan.price_amount),
      priceCurrency: plan.price_currency,
      interval: plan.billing_interval,
      limits: limitsSchema.parse(plan.limits ?? {}),
    },
    usage: { members, projects, customers, storageBytes },
  };
}
