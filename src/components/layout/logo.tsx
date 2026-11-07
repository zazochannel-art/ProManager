import Link from "next/link";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils/cn";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("flex size-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-white", className)}>
      P
    </span>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <LogoMark />
      <span>{siteConfig.name}</span>
    </Link>
  );
}
