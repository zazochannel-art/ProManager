"use client";

import { forwardRef, type ComponentPropsWithoutRef, type ComponentRef } from "react";
import { Label as LabelPrimitive } from "radix-ui";
import { cn } from "@/lib/utils/cn";

export const Label = forwardRef<ComponentRef<typeof LabelPrimitive.Root>, ComponentPropsWithoutRef<typeof LabelPrimitive.Root>>(
  function Label({ className, ...props }, ref) {
    return <LabelPrimitive.Root ref={ref} className={cn("text-sm font-medium text-foreground", className)} {...props} />;
  },
);
