"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n/client";
import { switchOrganizationAction } from "@/features/organizations/actions/organization-actions";

export interface OrganizationOption {
  id: string;
  name: string;
  roleLabel: string;
}

export function OrganizationSwitcher({ organizations, activeId }: { organizations: OrganizationOption[]; activeId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const active = organizations.find((o) => o.id === activeId);

  function select(id: string) {
    if (id === activeId) return;
    startTransition(async () => {
      const result = await switchOrganizationAction(id);
      if (!result.ok) {
        toast.error(t.common.genericError);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" className="max-w-[9.5rem] justify-between sm:max-w-[16rem]" disabled={pending} aria-label={t.shell.switchOrganization}>
          <Building2 aria-hidden="true" />
          <span className="min-w-0 truncate">{active?.name ?? t.shell.organization}</span>
          <ChevronsUpDown className="opacity-60" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{t.shell.switchOrganization}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={activeId} onValueChange={select}>
          {organizations.map((org) => (
            <DropdownMenuRadioItem key={org.id} value={org.id}>
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{org.name}</span>
                <span className="text-xs text-muted-foreground">{org.roleLabel}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/onboarding?new=1")}>
          <Plus aria-hidden="true" />
          {t.shell.createOrganization}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
