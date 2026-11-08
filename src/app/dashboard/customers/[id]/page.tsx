import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb } from "@/components/shared/breadcrumb";
import { DetailHero, initials } from "@/components/shared/detail-hero";
import { StatCard } from "@/components/shared/stat-card";
import { Briefcase, CalendarDays, FolderKanban, Mail, Phone, UsersRound } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/organization-context";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n/server";
import { formatDate } from "@/lib/utils/dates";
import { uuidField } from "@/lib/validation/common";
import {
  getCustomer,
  listCustomerAddresses,
  listCustomerContacts,
  listCustomerProjects,
} from "@/features/customers/services/customer-service";
import { EditCustomerDialog } from "@/features/customers/components/edit-customer-dialog";
import { ArchiveCustomerButton } from "@/features/customers/components/archive-customer-button";
import { CustomerContacts } from "@/features/customers/components/customer-contacts";
import { CustomerAddresses } from "@/features/customers/components/customer-addresses";
import { CreateProjectDialog } from "@/features/projects/components/create-project-dialog";
import { PROJECT_STATUS_VARIANT, type ProjectStatus } from "@/features/projects/schemas/project";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerDetailPage({ params }: PageProps<"/dashboard/customers/[id]">) {
  const ctx = await requirePagePermission("customers.read");
  const { id } = await params;
  if (!uuidField.safeParse(id).success) notFound();
  const { t, locale } = await getI18n();
  const supabase = await createClient();
  const customer = await getCustomer(supabase, ctx.organization.id, id);
  if (!customer) notFound();

  const canSeeProjects = ctx.can("projects.read");
  const [contacts, addresses, projects] = await Promise.all([
    listCustomerContacts(supabase, ctx.organization.id, id),
    listCustomerAddresses(supabase, ctx.organization.id, id),
    canSeeProjects ? listCustomerProjects(supabase, ctx.organization.id, id) : Promise.resolve([]),
  ]);
  const canWrite = ctx.can("customers.write");

  const details: { label: string; value: React.ReactNode }[] = [
    { label: t.customers.type, value: t.customers.types[customer.type] },
    { label: t.customers.legalName, value: customer.legal_name },
    { label: t.customers.taxId, value: customer.tax_id },
    { label: t.customers.email, value: customer.email ? <a className="text-primary hover:underline" href={`mailto:${customer.email}`}>{customer.email}</a> : null },
    { label: t.customers.phone, value: customer.phone ? <a className="text-primary hover:underline" href={`tel:${customer.phone}`}>{customer.phone}</a> : null },
    {
      label: t.customers.website,
      value: customer.website ? (
        <a className="text-primary hover:underline" href={customer.website} target="_blank" rel="noopener noreferrer nofollow">
          {customer.website.replace(/^https?:\/\//, "")}
        </a>
      ) : null,
    },
    { label: t.customers.createdAt, value: formatDate(customer.created_at, locale) },
  ];

  return (
    <>
      <DetailHero
        title={customer.name}
        avatar={initials(customer.name)}
        meta={
          <>
            <Badge variant="primary">{t.customers.types[customer.type]}</Badge>
            {customer.email ? (
              <a className="inline-flex items-center gap-1.5 hover:text-foreground" href={`mailto:${customer.email}`}>
                <Mail className="size-3.5" aria-hidden="true" />
                {customer.email}
              </a>
            ) : null}
            {customer.phone ? (
              <a className="inline-flex items-center gap-1.5 hover:text-foreground" href={`tel:${customer.phone}`}>
                <Phone className="size-3.5" aria-hidden="true" />
                {customer.phone}
              </a>
            ) : null}
          </>
        }
        breadcrumb={<Breadcrumb label={t.common.breadcrumb} items={[{ label: t.customers.title, href: "/dashboard/customers" }, { label: customer.name }]} />}
        actions={
          <>
            {canWrite ? <EditCustomerDialog customer={customer} /> : null}
            {ctx.can("customers.delete") ? <ArchiveCustomerButton customerId={customer.id} /> : null}
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {canSeeProjects ? (
          <>
            <StatCard label={t.customers.stats.activeProjects} value={String(projects.filter((p) => p.status === "active").length)} icon={FolderKanban} tone="primary" />
            <StatCard label={t.customers.stats.totalProjects} value={String(projects.length)} icon={Briefcase} tone="neutral" />
          </>
        ) : null}
        <StatCard label={t.customers.stats.contacts} value={String(contacts.length)} icon={UsersRound} tone="success" />
        <StatCard label={t.customers.stats.since} value={formatDate(customer.created_at, locale)} icon={CalendarDays} tone="warning" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t.customers.details}</CardTitle>
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
              {customer.notes ? (
                <div className="mt-4 border-t border-border pt-4 text-sm">
                  <p className="text-muted-foreground">{t.customers.notes}</p>
                  <p className="mt-1 whitespace-pre-line">{customer.notes}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {canSeeProjects ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle>{t.customers.projectsTitle}</CardTitle>
                {ctx.can("projects.write") ? (
                  <CreateProjectDialog
                    customers={[{ id: customer.id, name: customer.name }]}
                    defaultCurrency={ctx.currency}
                    defaultCustomerId={customer.id}
                    label={t.projects.new}
                  />
                ) : null}
              </CardHeader>
              <CardContent>
                {projects.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t.customers.projectsEmpty}</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {projects.map((project) => {
                      const status = project.status as ProjectStatus;
                      return (
                        <li key={project.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                          <Link href={`/dashboard/projects/${project.id}`} className="min-w-0 text-sm font-medium hover:text-primary hover:underline">
                            <span className="block truncate">{project.name}</span>
                            {project.code ? <span className="block text-xs font-normal text-muted-foreground">{project.code}</span> : null}
                          </Link>
                          <Badge variant={PROJECT_STATUS_VARIANT[status] ?? "neutral"}>{t.projects.statuses[status] ?? status}</Badge>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          <CustomerContacts customerId={customer.id} contacts={contacts} canWrite={canWrite} />
          <CustomerAddresses customerId={customer.id} addresses={addresses} canWrite={canWrite} defaultCountry={ctx.organization.country_code} />
        </div>
      </div>
    </>
  );
}
