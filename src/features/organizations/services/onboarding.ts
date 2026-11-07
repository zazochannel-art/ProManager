import type { Enums } from "@/types/database";

export type OnboardingStep = Enums<"onboarding_step">;

/** Ordered steps after the organization exists (registration, e-mail verification and org creation come first). */
export const ONBOARDING_STEPS: readonly OnboardingStep[] = ["company", "regional", "team", "customer", "project", "completed"];

export function nextOnboardingStep(current: OnboardingStep): OnboardingStep {
  const index = ONBOARDING_STEPS.indexOf(current);
  return ONBOARDING_STEPS[Math.min(index + 1, ONBOARDING_STEPS.length - 1)] ?? "completed";
}

/** Never move backwards: completing an earlier step again keeps later progress. */
export function advanceFrom(current: OnboardingStep, completed: OnboardingStep): OnboardingStep {
  const target = nextOnboardingStep(completed);
  return ONBOARDING_STEPS.indexOf(target) > ONBOARDING_STEPS.indexOf(current) ? target : current;
}

/** 1-based position in the full 6-step wizard (step 1 = create organization). */
export function wizardPosition(step: OnboardingStep | "organization"): number {
  if (step === "organization") return 1;
  return Math.min(ONBOARDING_STEPS.indexOf(step) + 2, 6);
}
