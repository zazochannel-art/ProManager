"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import type { NavKey } from "@/config/navigation";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useI18n } from "@/lib/i18n/client";
import { Logo } from "./logo";
import { NavList } from "./nav-list";

export function MobileNav({ navKeys }: { navKeys: NavKey[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t.shell.openNavigation}>
          <Menu className="size-5" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" closeLabel={t.shell.closeNavigation}>
        <SheetTitle className="sr-only">{t.shell.mainNavigation}</SheetTitle>
        <SheetDescription className="sr-only">{t.shell.mainNavigation}</SheetDescription>
        <div className="flex h-16 items-center px-5">
          <Logo href="/dashboard" />
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-6">
          <NavList keys={navKeys} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
