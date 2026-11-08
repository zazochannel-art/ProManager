import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

export const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap", {
  variants: {
    variant: {
      neutral: "bg-muted text-foreground/80 ring-border",
      primary: "bg-primary-soft text-primary-hover ring-primary/15",
      success: "bg-success-soft text-success ring-success/15",
      warning: "bg-warning-soft text-warning ring-warning/20",
      danger: "bg-danger-soft text-danger ring-danger/15",
      outline: "text-muted-foreground ring-border",
    },
  },
  defaultVariants: { variant: "neutral" },
});

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
