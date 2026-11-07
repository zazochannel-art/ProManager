import type { Metadata } from "next";
import { Briefcase } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { requirePagePermission } from "@/lib/auth/organization-context";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n";
import { parsePageParam } from "@/lib/utils/search-params";
import { listCustomerOptions } from "@/features/customers/services/customer-service";
import { PROJECTS_PAGE_SIZE, listProjects } from "@/features/projects/services/project-service";
import { ProjectsTable } from "@/features/projects/components/projects-table";
import { CreateProjectDialog } from "@/features/projects/components/create-project-dialog";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage({ searchParams }: PageProps<"/dashboard/projects">) {
  const ctx = await requirePagePermission("projects.read");
  const { t } = await getI18n();
  const page = parsePageParam((await searchParams).page);
  const supabase = await createClient();
  const canWrite = ctx.can("projects.write");
  const [{ rows, total }, customers] = await Promise.all([
    listProjects(supabase, ctx.organization.id, { page }),
    canWrite && ctx.can("customers.read") ? listCustomerOptions(supabase, ctx.organization.id) : Promise.resolve([]),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PROJECTS_PAGE_SIZE));
  const createButton = canWrite ? <CreateProjectDialog customers={customers} defaultCurrency={ctx.currency} /> : null;

  return (
    <>
      <PageHeader title={t.projects.title} description={t.projects.description} actions={createButton} />
      {total === 0 ? (
        <EmptyState icon={Briefcase} title={t.projects.empty} description={t.projects.emptyBody} action={createButton} />
      ) : (
        <>
          <ProjectsTable rows={rows.map((r) => ({ ...r, budget_amount: r.budget_amount === null ? null : String(r.budget_amount) }))} />
          <Pagination
            page={page}
            pageCount={pageCount}
            hrefForPage={(p) => `/dashboard/projects?page=${p}`}
            labels={{ previous: t.common.previous, next: t.common.next, nav: t.common.pagination, page: interpolate(t.common.page, { page, total: pageCount }) }}
          />
        </>
      )}
    </>
  );
}
