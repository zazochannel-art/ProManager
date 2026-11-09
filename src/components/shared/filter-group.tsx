import Link from "next/link";
import { cn } from "@/lib/utils/cn";

/** Segmented link filter (server-rendered; the state lives in the URL). */
export function FilterGroup({ label, items }: { label: string; items: { key: string; label: string; href: string; active: boolean }[] }) {
  return (
    <nav aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-lg border border-border bg-surface p-1 shadow-sm">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
            item.active ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
