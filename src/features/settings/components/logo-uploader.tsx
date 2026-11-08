"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { FieldError } from "@/components/forms/form-field";
import { useI18n } from "@/lib/i18n/client";
import { translateValidationMessage } from "@/lib/validation/messages";
import { actionErrorMessage } from "@/lib/validation/action-messages";
import { UPLOAD_POLICIES } from "@/lib/validation/file";
import { uploadLogoAction } from "../actions/settings-actions";

export function LogoUploader({ logoUrl, canEdit, organizationName }: { logoUrl: string | null; canEdit: boolean; organizationName: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    // Quick client-side pre-check; the server validates again (size, type, magic bytes).
    if (file.size > UPLOAD_POLICIES.logo.maxBytes) {
      setError(translateValidationMessage(t, "fileTooLarge") ?? null);
      return;
    }
    const data = new FormData();
    data.set("file", file);
    startTransition(async () => {
      const result = await uploadLogoAction(data);
      if (inputRef.current) inputRef.current.value = "";
      if (result.ok) {
        toast.success(t.settings.logoUploaded);
        router.refresh();
      } else if (result.fieldErrors?.file) {
        setError(translateValidationMessage(t, result.fieldErrors.file) ?? null);
      } else {
        setError(actionErrorMessage(t, result.error));
      }
    });
  }

  return (
    <div className="flex items-center gap-4">
      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage; next/image would need remote config per project
          <img src={logoUrl} alt={organizationName} className="size-full object-contain" />
        ) : (
          <ImageUp className="size-6 text-muted-foreground" aria-hidden="true" />
        )}
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{t.settings.logo}</p>
        <p className="text-xs text-muted-foreground">{t.settings.logoHelp}</p>
        {canEdit ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={UPLOAD_POLICIES.logo.allowedMimeTypes.join(",")}
              className="sr-only"
              id="logo-upload"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <Button type="button" variant="secondary" size="sm" className="mt-1 w-fit" loading={pending} onClick={() => inputRef.current?.click()}>
              {t.settings.uploadLogo}
            </Button>
          </>
        ) : null}
        {error ? <FieldError>{error}</FieldError> : null}
      </div>
    </div>
  );
}
