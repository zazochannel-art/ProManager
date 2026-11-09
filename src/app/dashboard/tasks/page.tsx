import type { Metadata } from "next";
import { AlarmClock, ListChecks, UserRoundCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { StatCard } from "@/components/shared/stat-card";
import { FilterGroup } from "@/components/shared/filter-group";
import { requirePagePermission } from "@/lib/auth/organization-context";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n";
import { parsePageParam } from "@/lib/utils/search-params";
import { todayInTimeZone } from "@/lib/utils/dates";
import { listMembers } from "@/features/settings/services/members-service";
import { listProjectOptions } from "@/features/projects/services/project-service";
import { TASK_PRIORITIES, TASK_STATUSES, type TaskPriority, type TaskStatus } from "@/features/projects/schemas/project";
import { TASKS_PAGE_SIZE, TASK_VIEWS, getTaskCounts, listTasks, type TaskView } from "@/features/tasks/services/task-service";
import { TaskList, type TaskRow } from "@/features/tasks/components/task-list";
import { CreateTaskDialog } from "@/features/tasks/components/create-task-dialog";

export const metadata: Metadata = { title: "Tasks" };

const single = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const isView = (v: string | undefined): v is TaskView => (TASK_VIEWS as readonly (string | undefined)[]).includes(v);

export default async function TasksPage({ searchParams }: PageProps<"/dashboard/tasks">) {
  const ctx = await requirePagePermission("tasks.read");
  const { t } = await getI18n();
  const params = await searchParams;
  const rawView = single(params.view);
  const view: TaskView = isView(rawView) ? rawView : "open";
  const mine = single(params.mine) === "1";
  const page = parsePageParam(params.page);

  const supabase = await createClient();
  const canManage = ctx.can("tasks.write");
  const today = todayInTimeZone(ctx.settings.timezone);
  // Overdue = deadline day before today; date-only deadlines are stored at 12:00 UTC.
  const overdueBefore = `${today}T00:00:00Z`;
  const [{ rows, total }, counts, members, projects] = await Promise.all([
    listTasks(supabase, ctx.organization.id, { view, assigneeId: mine ? ctx.user.id : undefined, page }),
    getTaskCounts(supabase, ctx.organization.id, ctx.user.id, overdueBefore),
    listMembers(supabase, ctx.organization.id),
    canManage && ctx.can("projects.read") ? listProjectOptions(supabase, ctx.organization.id) : Promise.resolve([]),
  ]);

  const memberOptions = members.filter((m) => m.status === "active").map((m) => ({ userId: m.userId, name: m.name || m.email }));
  const taskRows: TaskRow[] = rows.flatMap((task) =>
    (TASK_STATUSES as readonly string[]).includes(task.status) && (TASK_PRIORITIES as readonly string[]).includes(task.priority)
      ? [{ ...task, status: task.status as TaskStatus, priority: task.priority as TaskPriority }]
      : [],
  );
  const pageCount = Math.max(1, Math.ceil(total / TASKS_PAGE_SIZE));
  const href = (next: { view?: TaskView; mine?: boolean; page?: number }) => {
    const q = new URLSearchParams();
    const v = next.view ?? view;
    const m = next.mine ?? mine;
    if (v !== "open") q.set("view", v);
    if (m) q.set("mine", "1");
    if (next.page && next.page > 1) q.set("page", String(next.page));
    const s = q.toString();
    return s ? `/dashboard/tasks?${s}` : "/dashboard/tasks";
  };
  const createButton = canManage ? <CreateTaskDialog members={memberOptions} projects={projects} /> : null;

  return (
    <>
      <PageHeader title={t.tasks.title} description={t.tasks.description} actions={createButton} />
      <div className="mb-6 grid grid-cols-1 gap-4 min-[420px]:grid-cols-3">
        <StatCard label={t.tasks.stats.open} value={String(counts.open)} icon={ListChecks} tone="primary" />
        <StatCard label={t.tasks.stats.overdue} value={String(counts.overdue)} icon={AlarmClock} tone={counts.overdue > 0 ? "danger" : "success"} />
        <StatCard label={t.tasks.stats.mine} value={String(counts.mine)} icon={UserRoundCheck} tone="warning" />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <FilterGroup
          label={t.tasks.filters.status}
          items={TASK_VIEWS.map((v) => ({ key: v, label: t.tasks.filters.views[v], href: href({ view: v }), active: v === view }))}
        />
        <FilterGroup
          label={t.tasks.filters.assignee}
          items={[
            { key: "all", label: t.tasks.filters.everyone, href: href({ mine: false }), active: !mine },
            { key: "mine", label: t.tasks.filters.mine, href: href({ mine: true }), active: mine },
          ]}
        />
      </div>

      {total === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={view === "open" && !mine ? t.tasks.emptyAll : t.tasks.emptyFiltered}
          description={view === "open" && !mine ? t.tasks.emptyAllBody : undefined}
          action={view === "open" && !mine ? createButton : null}
        />
      ) : (
        <>
          <Card>
            <CardContent className="pt-6">
              <TaskList
                tasks={taskRows}
                members={memberOptions}
                currentUserId={ctx.user.id}
                canManage={canManage}
                canUpdateAssigned={ctx.can("tasks.update_assigned")}
                today={today}
                showProject
              />
            </CardContent>
          </Card>
          <Pagination
            page={page}
            pageCount={pageCount}
            hrefForPage={(p) => href({ page: p })}
            labels={{ previous: t.common.previous, next: t.common.next, nav: t.common.pagination, page: interpolate(t.common.page, { page, total: pageCount }) }}
          />
        </>
      )}
    </>
  );
}
