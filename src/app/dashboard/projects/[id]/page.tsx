import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb } from "@/components/shared/breadcrumb";
import { PageHeader } from "@/components/shared/page-header";
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
  const [tasks, members, customers, financials] = await Promise.all([
    canSeeTasks ? listProjectTasks(supabase, ctx.organization.id, id) : Promise.resolve([]),
    canSeeTasks ? listMembers(supabase, ctx.organization.id) : Promise.resolve([]),
    canWrite ? listCustomerOptions(supabase, ctx.organization.id) : Promise.resolve([]),
    canSeeFinancials ? getProjectFinancials(supabase, ctx.organization.id, id) : Promise.resolve(null),
  ]);

  const status: ProjectStatus = isProjectStatus(project.status) ? project.status : "planned";
  const currency: CurrencyCode = isCurrency(project.currency) ? project.currency : ctx.currency;
  const taskRows: TaskRow[] = tasks.flatMap((task) =>
    (TASK_STATUSES as readonly string[]).includes(task.status) && (TASK_PRIORITIES as readonly string[]).includes(task.priority)
      ? [{ ...task, status: task.status as TaskRow["status"], priority: task.priority as TaskRow["priority"] }]
      : [],
  );
  const memberOptions = members.filter((m) => m.status === "active").map((m) => ({ userId: m.userId, name: m.name || m.email }));

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
      <PageHeader
        title={project.name}
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
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle>{t.projects.overview}</CardTitle>
              <Badge variant={PROJECT_STATUS_VARIANT[status]}>{t.projects.statuses[status]}</Badge>
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

          {canSeeTasks ? (
            <ProjectTasks
              projectId={project.id}
              tasks={taskRows}
              members={memberOptions}
              currentUserId={ctx.user.id}
              canManage={ctx.can("tasks.write")}
              canUpdateAssigned={ctx.can("tasks.update_assigned")}
            />
          ) : null}
        </div>
        <div className="flex flex-col gap-6">{financials ? <ProjectFinancialsCard financials={financials} t={t} locale={locale} /> : null}</div>
      </div>
    </>
  );
}
