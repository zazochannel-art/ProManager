import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb } from "@/components/shared/breadcrumb";
import { DetailHero } from "@/components/shared/detail-hero";
import { StatCard } from "@/components/shared/stat-card";
import { CalendarClock, ListChecks, TrendingUp, Wallet, Building2, FolderKanban } from "lucide-react";
import { computeProjectProfitability } from "@/lib/calculations/profitability";
import { isNegative } from "@/lib/calculations/decimal";
import { formatPercent } from "@/lib/currency/format";
import { todayInTimeZone } from "@/lib/utils/dates";
import { CURRENCIES, type CurrencyCode } from "@/config/site";
import { requirePagePermission } from "@/lib/auth/organization-context";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n";
import { formatDate } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/currency/format";
import { uuidField } from "@/lib/validation/common";
import { listCustomerOptions } from "@/features/customers/services/customer-service";
import { listMembers } from "@/features/settings/services/members-service";
import { getProject, getProjectFinancials, listProjectTasks } from "@/features/projects/services/project-service";
import { PROJECT_STATUSES, PROJECT_STATUS_VARIANT, TASK_PRIORITIES, TASK_STATUSES, type ProjectStatus } from "@/features/projects/schemas/project";
import { EditProjectDialog } from "@/features/projects/components/edit-project-dialog";
import { ArchiveProjectButton } from "@/features/projects/components/archive-project-button";
import { ProjectStatusSelect } from "@/features/projects/components/project-status-select";
import { ProjectTasks, type TaskRow } from "@/features/projects/components/project-tasks";
import { ProjectFinancialsCard } from "@/features/projects/components/project-financials-card";
import { ProjectPhases } from "@/features/projects/components/project-phases";
import { ProjectMembers, type ProjectMemberRow } from "@/features/projects/components/project-members";
import { ProjectTime } from "@/features/projects/components/project-time";
import { listProjectMembers, listProjectPhases, listProjectTimeEntries } from "@/features/projects/services/project-work-service";
import { PROJECT_MEMBER_ROLES } from "@/features/projects/schemas/project-work";

export const metadata: Metadata = { title: "Project" };

const isProjectStatus = (v: string): v is ProjectStatus => (PROJECT_STATUSES as readonly string[]).includes(v);
const isCurrency = (v: string): v is CurrencyCode => (CURRENCIES as readonly string[]).includes(v);

export default async function ProjectDetailPage({ params }: PageProps<"/dashboard/projects/[id]">) {
  const ctx = await requirePagePermission("projects.read");
  const { id } = await params;
  if (!uuidField.safeParse(id).success) notFound();
  const { t, locale } = await getI18n();
  const supabase = await createClient();
  const project = await getProject(supabase, ctx.organization.id, id);
  if (!project) notFound();

  const canWrite = ctx.can("projects.write");
  const canSeeTasks = ctx.can("tasks.read");
  const canSeeFinancials = ctx.can("dashboard.financials");
  const canSeeTime = ctx.can("time.read") || ctx.can("time.write_own") || ctx.can("time.manage");
  const [tasks, members, customers, financials, phases, projectMembers, time] = await Promise.all([
    canSeeTasks ? listProjectTasks(supabase, ctx.organization.id, id) : Promise.resolve([]),
    listMembers(supabase, ctx.organization.id),
    canWrite ? listCustomerOptions(supabase, ctx.organization.id) : Promise.resolve([]),
    canSeeFinancials ? getProjectFinancials(supabase, ctx.organization.id, id) : Promise.resolve(null),
    listProjectPhases(supabase, ctx.organization.id, id),
    listProjectMembers(supabase, ctx.organization.id, id),
    canSeeTime ? listProjectTimeEntries(supabase, ctx.organization.id, id) : Promise.resolve(null),
  ]);

  const status: ProjectStatus = isProjectStatus(project.status) ? project.status : "planned";
  const currency: CurrencyCode = isCurrency(project.currency) ? project.currency : ctx.currency;
  const taskRows: TaskRow[] = tasks.flatMap((task) =>
    (TASK_STATUSES as readonly string[]).includes(task.status) && (TASK_PRIORITIES as readonly string[]).includes(task.priority)
      ? [{ ...task, status: task.status as TaskRow["status"], priority: task.priority as TaskRow["priority"] }]
      : [],
  );
  const memberOptions = members.filter((m) => m.status === "active").map((m) => ({ userId: m.userId, name: m.name || m.email }));
  // Names for everybody who ever logged time or joined the team, including former members.
  const allPeople = members.map((m) => ({ userId: m.userId, name: m.name || m.email }));
  const projectMemberRows: ProjectMemberRow[] = projectMembers.flatMap((m) =>
    (PROJECT_MEMBER_ROLES as readonly string[]).includes(m.project_role) ? [{ ...m, project_role: m.project_role as ProjectMemberRow["project_role"] }] : [],
  );

  const openTasks = taskRows.filter((task) => task.status !== "cancelled");
  const doneTasks = openTasks.filter((task) => task.status === "done").length;
  const progress = openTasks.length ? Math.round((doneTasks / openTasks.length) * 100) : 0;
  const profitability = financials ? computeProjectProfitability(financials) : null;
  const today = todayInTimeZone(ctx.settings.timezone);
  const daysToEnd = project.end_date ? Math.round((Date.parse(project.end_date) - Date.parse(today)) / 86_400_000) : null;
  const deadlineHint =
    daysToEnd === null || status === "completed" || status === "cancelled"
      ? undefined
      : daysToEnd > 0
        ? interpolate(t.projects.stats.daysLeft, { days: daysToEnd })
        : daysToEnd === 0
          ? t.projects.stats.dueToday
          : interpolate(t.projects.stats.overdue, { days: -daysToEnd });

  const period =
    project.start_date || project.end_date
      ? `${formatDate(project.start_date, locale)} – ${formatDate(project.end_date, locale)}`
      : t.projects.noDates;

  const details: { label: string; value: React.ReactNode }[] = [
    {
      label: t.projects.customer,
      value: project.customer_id && project.customer_name ? (
        <Link className="text-primary hover:underline" href={`/dashboard/customers/${project.customer_id}`}>
          {project.customer_name}
        </Link>
      ) : (
        t.projects.noCustomer
      ),
    },
    { label: t.projects.code, value: project.code },
    { label: t.projects.period, value: period },
    { label: t.projects.budget, value: project.budget_amount === null ? t.projects.noBudget : formatMoney(project.budget_amount, currency, locale) },
    { label: t.projects.currency, value: currency },
  ];

  return (
    <>
      <DetailHero
        title={project.name}
        icon={FolderKanban}
        meta={
          <>
            <Badge variant={PROJECT_STATUS_VARIANT[status]}>{t.projects.statuses[status]}</Badge>
            {project.code ? <span className="font-mono text-xs">{project.code}</span> : null}
            {project.customer_id && project.customer_name ? (
              <Link className="inline-flex items-center gap-1.5 hover:text-foreground" href={`/dashboard/customers/${project.customer_id}`}>
                <Building2 className="size-3.5" aria-hidden="true" />
                {project.customer_name}
              </Link>
            ) : null}
          </>
        }
        breadcrumb={<Breadcrumb label={t.common.breadcrumb} items={[{ label: t.projects.title, href: "/dashboard/projects" }, { label: project.name }]} />}
        actions={
          <>
            {canWrite ? <ProjectStatusSelect projectId={project.id} status={status} /> : null}
            {canWrite ? (
              <EditProjectDialog
                project={{
                  id: project.id,
                  name: project.name,
                  code: project.code,
                  customer_id: project.customer_id,
                  status,
                  start_date: project.start_date,
                  end_date: project.end_date,
                  budget_amount: project.budget_amount === null ? null : String(project.budget_amount),
                  currency,
                }}
                customers={customers}
              />
            ) : null}
            {ctx.can("projects.delete") ? <ArchiveProjectButton projectId={project.id} /> : null}
          </>
        }
      />
      <div className="mb-6 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t.projects.budget}
          value={project.budget_amount === null ? t.projects.noBudget : formatMoney(project.budget_amount, currency, locale)}
          hint={profitability?.budgetUsedPercent ? interpolate(t.projects.stats.budgetUsed, { percent: formatPercent(profitability.budgetUsedPercent, locale) }) : undefined}
          icon={Wallet}
          tone="primary"
        />
        {canSeeTasks ? (
          <StatCard
            label={t.projects.stats.progress}
            value={`${progress}%`}
            progress={progress}
            hint={openTasks.length ? interpolate(t.tasks.progress, { done: doneTasks, total: openTasks.length }) : t.projects.stats.noTasks}
            icon={ListChecks}
            tone="success"
          />
        ) : null}
        {profitability ? (
          <StatCard
            label={t.projects.financials.grossProfit}
            value={formatMoney(profitability.grossProfit, currency, locale)}
            hint={profitability.marginPercent ? interpolate(t.projects.stats.margin, { percent: formatPercent(profitability.marginPercent, locale) }) : undefined}
            icon={TrendingUp}
            tone={isNegative(profitability.grossProfit) ? "danger" : "success"}
          />
        ) : null}
        <StatCard
          label={t.projects.stats.deadline}
          value={project.end_date ? formatDate(project.end_date, locale) : "—"}
          hint={deadlineHint}
          icon={CalendarClock}
          tone={daysToEnd !== null && daysToEnd < 0 && deadlineHint ? "danger" : "warning"}
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t.projects.overview}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
                {details.map((d) => (
                  <div key={d.label} className="min-w-0">
                    <dt className="text-muted-foreground">{d.label}</dt>
                    <dd className="mt-0.5 truncate font-medium">{d.value ?? "—"}</dd>
                  </div>
                ))}
              </dl>
              {project.completed_at ? (
                <p className="mt-4 text-sm text-success">{interpolate(t.projects.completedOn, { date: formatDate(project.completed_at, locale) })}</p>
              ) : null}
            </CardContent>
          </Card>

          <ProjectPhases
            projectId={project.id}
            phases={phases.map((p) => ({ ...p, planned_hours: p.planned_hours === null ? null : String(p.planned_hours) }))}
            canManage={canWrite}
          />

          {canSeeTasks ? (
            <ProjectTasks
              projectId={project.id}
              tasks={taskRows}
              members={memberOptions}
              currentUserId={ctx.user.id}
              canManage={ctx.can("tasks.write")}
              canUpdateAssigned={ctx.can("tasks.update_assigned")}
              today={today}
            />
          ) : null}

          {time ? (
            <ProjectTime
              projectId={project.id}
              entries={time.rows}
              totalMinutes={time.totalMinutes}
              billableMinutes={time.billableMinutes}
              people={allPeople}
              currentUserId={ctx.user.id}
              today={today}
              canLogOwn={ctx.can("time.write_own")}
              canManage={ctx.can("time.manage")}
              seesEveryone={ctx.can("time.read")}
            />
          ) : null}
        </div>
        <div className="flex flex-col gap-6">
          {financials ? <ProjectFinancialsCard financials={financials} t={t} locale={locale} /> : null}
          <ProjectMembers
            projectId={project.id}
            members={projectMemberRows}
            people={allPeople}
            active={memberOptions}
            canManage={canWrite}
          />
        </div>
      </div>
    </>
  );
}
