import type { NavKey } from "@/config/navigation";
import { Logo } from "./logo";
import { NavList } from "./nav-list";

/** Desktop sidebar (sticky). The mobile equivalent is <MobileNav>. */
export function Sidebar({ navKeys }: { navKeys: NavKey[] }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border/70 bg-surface lg:flex">
      <div className="flex h-16 items-center px-5">
        <Logo href="/dashboard" />
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-6">
        <NavList keys={navKeys} />
      </div>
    </aside>
  );
}
