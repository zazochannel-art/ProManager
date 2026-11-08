"use client";

import { Toaster as SonnerToaster, toast } from "sonner";

/** App-wide toast host (Sonner), styled with the design tokens. */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      closeButton
      toastOptions={{
        classNames: {
          toast: "!rounded-md !border !border-border !bg-surface !text-foreground !shadow-md",
          description: "!text-muted-foreground",
          error: "!border-danger/30",
          success: "!border-success/30",
        },
      }}
    />
  );
}

export { toast };
