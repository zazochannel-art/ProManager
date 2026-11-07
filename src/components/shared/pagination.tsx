import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

/** Server-side pagination via ?page=N links (works without JavaScript). */
export function Pagination({
  page,
  pageCount,
  hrefForPage,
  labels,
}: {
  page: number;
  pageCount: number;
  hrefForPage: (page: number) => string;
  labels: { previous: string; next: string; page: string; nav: string };
}) {
  if (pageCount <= 1) return null;
  const prevDisabled = page <= 1;
  const nextDisabled = page >= pageCount;
  return (
    <nav aria-label={labels.nav} className="flex items-center justify-between gap-2 pt-4">
      <p className="text-sm text-muted-foreground">{labels.page}</p>
      <div className="flex gap-2">
        {prevDisabled ? (
          <span aria-disabled="true" className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "pointer-events-none opacity-50")}>
            <ChevronLeft aria-hidden="true" /> {labels.previous}
          </span>
        ) : (
          <Link href={hrefForPage(page - 1)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            <ChevronLeft aria-hidden="true" /> {labels.previous}
          </Link>
        )}
        {nextDisabled ? (
          <span aria-disabled="true" className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "pointer-events-none opacity-50")}>
            {labels.next} <ChevronRight aria-hidden="true" />
          </span>
        ) : (
          <Link href={hrefForPage(page + 1)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            {labels.next} <ChevronRight aria-hidden="true" />
          </Link>
        )}
      </div>
    </nav>
  );
}
