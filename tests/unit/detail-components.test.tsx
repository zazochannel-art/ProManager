import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n/client";
import { en } from "@/lib/i18n/dictionaries/en";

const createProjectTaskAction = vi.fn(async () => ({ ok: true as const, data: { id: "t-new" } }));
vi.mock("@/features/projects/actions/project-actions", () => ({
  createProjectTaskAction: (...args: unknown[]) => createProjectTaskAction(...(args as [])),
  deleteProjectTaskAction: vi.fn(),
  setTaskStatusAction: vi.fn(),
}));
vi.mock("@/features/customers/actions/customer-actions", () => ({ addContactAction: vi.fn(), deleteContactAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/" }));

const { ProjectTasks } = await import("@/features/projects/components/project-tasks");
const { CustomerContacts } = await import("@/features/customers/components/customer-contacts");

const withI18n = (children: ReactNode) => (
  <I18nProvider locale="en" dictionary={en}>
    {children}
  </I18nProvider>
);

const PROJECT = "11111111-1111-4111-8111-111111111111";
const ME = "22222222-2222-4222-8222-222222222222";
const tasks = [
  { id: "a", title: "Demolition", status: "done" as const, priority: "high" as const, due_at: null, assignee_id: ME },
  { id: "b", title: "Painting", status: "todo" as const, priority: "medium" as const, due_at: null, assignee_id: null },
];

describe("ProjectTasks", () => {
  it("shows progress and lets an assignee change only their own task", () => {
    render(withI18n(<ProjectTasks projectId={PROJECT} tasks={tasks} members={[{ userId: ME, name: "Ana" }]} currentUserId={ME} canManage={false} canUpdateAssigned />));
    expect(screen.getByText("1 of 2 done")).toBeInTheDocument();
    expect(screen.queryByLabelText(en.tasks.taskTitle)).not.toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]!).getByRole("combobox", { name: en.tasks.status })).toBeInTheDocument();
    expect(within(items[1]!).queryByRole("combobox")).not.toBeInTheDocument();
    expect(within(items[1]!).getByText(en.tasks.unassigned)).toBeInTheDocument();
  });

  it("validates and submits a new task for managers", async () => {
    const user = userEvent.setup();
    render(withI18n(<ProjectTasks projectId={PROJECT} tasks={[]} members={[]} currentUserId={ME} canManage canUpdateAssigned />));
    expect(screen.getByText(en.tasks.empty)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: en.tasks.add }));
    expect(await screen.findByText(en.validation.required)).toBeInTheDocument();
    expect(createProjectTaskAction).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText(en.tasks.taskTitle), "Install sockets");
    await user.click(screen.getByRole("button", { name: en.tasks.add }));
    await vi.waitFor(() => expect(createProjectTaskAction).toHaveBeenCalledWith(PROJECT, expect.objectContaining({ title: "Install sockets", priority: "medium" })));
  });
});

describe("CustomerContacts", () => {
  it("hides write actions from read-only roles", () => {
    render(
      withI18n(
        <CustomerContacts
          customerId={PROJECT}
          canWrite={false}
          contacts={[{ id: "c", full_name: "Ion Popescu", position: "Director", email: "ion@client.md", phone: null, is_primary: true }]}
        />,
      ),
    );
    expect(screen.getByText("Ion Popescu")).toBeInTheDocument();
    expect(screen.getByText(en.customers.contacts.primary)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ion@client.md" })).toHaveAttribute("href", "mailto:ion@client.md");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
