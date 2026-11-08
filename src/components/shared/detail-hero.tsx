import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/** Initials for an avatar: first letters of the first two words. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "").concat(parts[1]?.[0] ?? "").toUpperCase() || "?";
}

/**
 * Header of a record page: breadcrumb, avatar or icon, title, meta chips and
 * actions on a soft gradient card.
 */
export function DetailHero({
  breadcrumb,
  title,
  avatar,
  icon: Icon,
  meta,
  actions,
  className,
}: {
  breadcrumb?: ReactNode;
  title: string;
  avatar?: string;
  icon?: LucideIcon;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6 overflow-hidden rounded-xl border border-border/80 bg-hero shadow-sm", className)}>
      <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          {breadcrumb ? <div className="mb-4">{breadcrumb}</div> : null}
          <div className="flex items-center gap-4">
            <span
              aria-hidden="true"
              className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-brand text-lg font-semibold text-white shadow-glow"
            >
              {Icon ? <Icon className="size-6" /> : avatar}
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-balance break-words sm:text-[1.75rem]">{title}</h1>
              {meta ? <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">{meta}</div> : null}
            </div>
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
