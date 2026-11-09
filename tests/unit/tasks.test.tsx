import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n/client";
import { en } from "@/lib/i18n/dictionaries/en";
import { taskCreateSchema } from "@/features/projects/schemas/project";

vi.mock("@/features/tasks/actions/task-actions", () => ({ createTaskAction: vi.fn(), deleteTaskAction: vi.fn(), setTaskStatusAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/" }));

const { TaskList, isTaskOverdue } = await import("@/features/tasks/components/task-list");

const withI18n = (children: ReactNode) => (
  <I18nProvider locale="en" dictionary={en}>
    {children}
  </I18nProvider>
);

const PROJECT = "11111111-1111-4111-8111-111111111111";
const ME = "22222222-2222-4222-8222-222222222222";

describe("isTaskOverdue", () => {
  it("flags open tasks whose deadline day has passed", () => {
    expect(isTaskOverdue({ status: "todo", due_at: "2026-11-07T12:00:00Z" }, "2026-11-08")).toBe(true);
    expect(isTaskOverdue({ status: "todo", due_at: "2026-11-08T12:00:00Z" }, "2026-11-08")).toBe(false);
    expect(isTaskOverdue({ status: "done", due_at: "2026-11-01T12:00:00Z" }, "2026-11-08")).toBe(false);
    expect(isTaskOverdue({ status: "blocked", due_at: null }, "2026-11-08")).toBe(false);
  });
});

describe("taskCreateSchema", () => {
  it("treats 'none' as no project and rejects malformed ids", () => {
    const base = { title: "Order tiles", priority: "medium" };
    expect(taskCreateSchema.parse({ ...base, projectId: "none" }).projectId).toBeUndefined();
    expect(taskCreateSchema.parse({ ...base, projectId: PROJECT }).projectId).toBe(PROJECT);
    expect(taskCreateSchema.safeParse({ ...base, projectId: "x" }).success).toBe(false);
  });
});

describe("TaskList", () => {
  it("links the project, marks overdue tasks and hides management from read-only roles", () => {
    render(
      withI18n(
        <TaskList
          tasks={[
            { id: "a", title: "Order tiles", status: "todo", priority: "urgent", due_at: "2026-11-01T12:00:00Z", assignee_id: null, project_id: PROJECT, project_name: "Renovation" },
            { id: "b", title: "Call supplier", status: "todo", priority: "low", due_at: null, assignee_id: ME, project_id: null, project_name: null },
          ]}
          members={[{ userId: ME, name: "Ana" }]}
          currentUserId={ME}
          canManage={false}
          canUpdateAssigned={false}
          today="2026-11-08"
          showProject
        />,
      ),
    );
    const [first, second] = screen.getAllByRole("listitem");
    expect(within(first!).getByRole("link", { name: "Renovation" })).toHaveAttribute("href", `/dashboard/projects/${PROJECT}`);
    expect(within(first!).getByText(new RegExp(en.tasks.overdue))).toBeInTheDocument();
    expect(within(second!).getByText(en.tasks.noProject)).toBeInTheDocument();
    expect(within(second!).getByText("Ana")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
