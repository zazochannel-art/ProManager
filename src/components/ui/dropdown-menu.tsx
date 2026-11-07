"use client";

import { forwardRef, type ComponentPropsWithoutRef, type ComponentRef } from "react";
import { DropdownMenu as DropdownPrimitive } from "radix-ui";
import { cn } from "@/lib/utils/cn";

export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;
export const DropdownMenuGroup = DropdownPrimitive.Group;
export const DropdownMenuRadioGroup = DropdownPrimitive.RadioGroup;

export const DropdownMenuContent = forwardRef<
  ComponentRef<typeof DropdownPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>
>(function DropdownMenuContent({ className, sideOffset = 6, align = "end", ...props }, ref) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        align={align}
        className={cn("z-50 min-w-48 overflow-hidden rounded-md border border-border bg-surface p-1 text-foreground shadow-md", className)}
        {...props}
      />
    </DropdownPrimitive.Portal>
  );
});

export const DropdownMenuItem = forwardRef<ComponentRef<typeof DropdownPrimitive.Item>, ComponentPropsWithoutRef<typeof DropdownPrimitive.Item>>(
  function DropdownMenuItem({ className, ...props }, ref) {
    return (
      <DropdownPrimitive.Item
        ref={ref}
        className={cn(
          "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-2 text-sm outline-none focus:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-muted-foreground",
          className,
        )}
        {...props}
      />
    );
  },
);

export const DropdownMenuRadioItem = forwardRef<
  ComponentRef<typeof DropdownPrimitive.RadioItem>,
  ComponentPropsWithoutRef<typeof DropdownPrimitive.RadioItem>
>(function DropdownMenuRadioItem({ className, children, ...props }, ref) {
  return (
    <DropdownPrimitive.RadioItem
      ref={ref}
      className={cn("relative flex cursor-default select-none items-center rounded-sm py-2 pl-7 pr-2 text-sm outline-none focus:bg-muted", className)}
      {...props}
    >
      <span className="absolute left-2 flex size-3 items-center justify-center">
        <DropdownPrimitive.ItemIndicator>
          <span className="block size-2 rounded-full bg-primary" />
        </DropdownPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownPrimitive.RadioItem>
  );
});

export const DropdownMenuLabel = forwardRef<ComponentRef<typeof DropdownPrimitive.Label>, ComponentPropsWithoutRef<typeof DropdownPrimitive.Label>>(
  function DropdownMenuLabel({ className, ...props }, ref) {
    return <DropdownPrimitive.Label ref={ref} className={cn("px-2 py-1.5 text-xs font-medium text-muted-foreground", className)} {...props} />;
  },
);

export const DropdownMenuSeparator = forwardRef<
  ComponentRef<typeof DropdownPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof DropdownPrimitive.Separator>
>(function DropdownMenuSeparator({ className, ...props }, ref) {
  return <DropdownPrimitive.Separator ref={ref} className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
});
