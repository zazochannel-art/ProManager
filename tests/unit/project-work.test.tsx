import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n/client";
import { en } from "@/lib/i18n/dictionaries/en";
import { hoursToMinutes, minutesToHours, phaseCreateSchema, timeEntryCreateSchema } from "@/features/projects/schemas/project-work";

const logTimeAction = vi.fn(async () => ({ ok: true as const, data: { id: "e-new" } }));
vi.mock("@/features/projects/actions/project-work-actions", () => ({
  createPhaseAction: vi.fn(),
  setPhaseProgressAction: vi.fn(),
  deletePhaseAction: vi.fn(),
  addProjectMemberAction: vi.fn(),
  setProjectMemberRoleAction: vi.fn(),
  removeProjectMemberAction: vi.fn(),
  logTimeAction: (...args: unknown[]) => logTimeAction(...(args as [])),
  deleteTimeEntryAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/" }));

const { ProjectPhases } = await import("@/features/projects/components/project-phases");
const { ProjectMembers } = await import("@/features/projects/components/project-members");
const { ProjectTime } = await import("@/features/projects/components/project-time");

const withI18n = (children: ReactNode) => (
  <I18nProvider locale="en" dictionary={en}>
    {children}
  </I18nProvider>
);

const PROJECT = "11111111-1111-4111-8111-111111111111";
const ME = "22222222-2222-4222-8222-222222222222";
const ANA = "33333333-3333-4333-8333-333333333333";

describe("hours conversion", () => {
  it("is exact for two-decimal inputs", () => {
    expect(hoursToMinutes("7.5")).toBe(450);
    expect(hoursToMinutes("0.25")).toBe(15);
    expect(hoursToMinutes("8")).toBe(480);
    expect(minutesToHours(450)).toBe("7.5");
    expect(minutesToHours(480)).toBe("8");
    expect(minutesToHours(20)).toBe("0.33");
  });
});

describe("schemas", () => {
  it("validate time entries", () => {
    const base = { date: "2026-11-08", billable: true };
    expect(timeEntryCreateSchema.parse({ ...base, hours: "7,5", userId: "self" })).toMatchObject({ hours: "7.5", userId: undefined });
    expect(timeEntryCreateSchema.safeParse({ ...base, hours: "25" }).success).toBe(false);
    expect(timeEntryCreateSchema.safeParse({ ...base, hours: "0" }).success).toBe(false);
    expect(timeEntryCreateSchema.safeParse({ ...base, hours: "abc" }).success).toBe(false);
    expect(timeEntryCreateSchema.safeParse({ ...base, date: "", hours: "1" }).success).toBe(false);
  });

  it("validate phases", () => {
    expect(phaseCreateSchema.parse({ name: "Demolition", plannedHours: "" }).plannedHours).toBeUndefined();
    expect(phaseCreateSchema.parse({ name: "Demolition", plannedHours: "16,5" }).plannedHours).toBe("16.5");
    expect(phaseCreateSchema.safeParse({ name: "X", plannedStart: "2026-11-10", plannedEnd: "2026-11-01" }).success).toBe(false);
  });
});

describe("ProjectPhases", () => {
  it("shows phases with progress and no controls for read-only roles", () => {
    render(
      withI18n(
        <ProjectPhases
          projectId={PROJECT}
          canManage={false}
          phases={[
            { id: "a", name: "Demolition", planned_start: null, planned_end: null, planned_hours: "16.5", progress_percent: 100 },
            { id: "b", name: "Electrical", planned_start: null, planned_end: null, planned_hours: null, progress_percent: 40 },
          ]}
        />,
      ),
    );
    expect(screen.getByText("Average progress 70%")).toBeInTheDocument();
    expect(screen.getByText("16.5 h planned")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: `${en.projects.phases.progress}: Electrical` })).toHaveAttribute("aria-valuenow", "40");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("ProjectMembers", () => {
  it("offers only colleagues who are not on the team yet", () => {
    render(
      withI18n(
        <ProjectMembers
          projectId={PROJECT}
          canManage
          members={[{ id: "m1", user_id: ANA, project_role: "lead" }]}
          people={[
            { userId: ANA, name: "Ana Rusu" },
            { userId: ME, name: "Ion Popescu" },
          ]}
          active={[{ userId: ANA, name: "Ana Rusu" }]}
        />,
      ),
    );
    expect(screen.getByText("Ana Rusu")).toBeInTheDocument();
    expect(screen.getByText(en.projects.members.allAdded)).toBeInTheDocument();
  });
});

describe("ProjectTime", () => {
  it("shows totals and lets a member log their own hours", async () => {
    const user = userEvent.setup();
    render(
      withI18n(
        <ProjectTime
          projectId={PROJECT}
          entries={[{ id: "e1", user_id: ANA, started_at: "2026-11-05T12:00:00Z", duration_minutes: 450, billable: false, notes: "Tiles" }]}
          totalMinutes={450}
          billableMinutes={0}
          people={[{ userId: ANA, name: "Ana Rusu" }]}
          currentUserId={ME}
          today="2026-11-08"
          canLogOwn
          canManage={false}
          seesEveryone={false}
        />,
      ),
    );
    expect(screen.getByText("Total 7.5 h")).toBeInTheDocument();
    expect(screen.getByText(en.projects.time.ownOnly)).toBeInTheDocument();
    const entry = screen.getByRole("listitem");
    expect(within(entry).getByText(en.projects.time.nonBillable)).toBeInTheDocument();
    // Somebody else's entry cannot be deleted by a non-manager.
    expect(within(entry).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(en.projects.time.person)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(en.projects.time.hours), "8");
    await user.click(screen.getByRole("button", { name: en.projects.time.log }));
    await vi.waitFor(() =>
      expect(logTimeAction).toHaveBeenCalledWith(PROJECT, expect.objectContaining({ date: "2026-11-08", hours: "8", billable: true, userId: undefined })),
    );
  });
});
