"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Eye, EyeOff, File, FileImage, FileSpreadsheet, FileText, Loader2, MoreHorizontal, Paperclip, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { useRunAction } from "@/hooks/use-run-action";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/client";
import { interpolate } from "@/lib/i18n";
import { formatDate } from "@/lib/utils/dates";
import { translateValidationMessage } from "@/lib/validation/messages";
import { actionErrorMessage } from "@/lib/validation/action-messages";
import { DOCUMENT_POLICY, formatFileSize, type DocumentEntity } from "../schemas/files";
import { deleteDocumentAction, finalizeDocumentUploadAction, getDocumentDownloadUrlAction, prepareDocumentUploadAction, setDocumentClientVisibleAction } from "../actions/document-actions";

export interface DocumentCardRow {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  is_client_visible: boolean;
  created_at: string;
}

const ACCEPT = DOCUMENT_POLICY.allowedMimeTypes.join(",");

function FileIcon({ mime }: { mime: string }) {
  const Icon = mime.startsWith("image/") ? FileImage : mime.includes("spreadsheet") || mime === "text/csv" ? FileSpreadsheet : mime === "application/pdf" || mime.includes("word") ? FileText : File;
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
      <Icon aria-hidden="true" className="size-4" />
    </span>
  );
}

/** Files of a project or customer: upload, download, share with the client portal, delete. */
export function DocumentsCard({
  entityType,
  entityId,
  documents,
  canWrite,
  canDelete,
}: {
  entityType: DocumentEntity;
  entityId: string;
  documents: DocumentCardRow[];
  canWrite: boolean;
  canDelete: boolean;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const run = useRunAction();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<DocumentCardRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function uploadOne(file: globalThis.File): Promise<boolean> {
    const fileError = (key: string) => {
      toast.error(`${file.name}: ${translateValidationMessage(t, key) ?? t.common.genericError}`);
      return false;
    };
    // Quick checks here; the server checks the stored bytes again.
    if (file.size > DOCUMENT_POLICY.maxBytes) return fileError("fileTooLarge");
    if (!(DOCUMENT_POLICY.allowedMimeTypes as readonly string[]).includes(file.type)) return fileError("fileType");
    const meta = { entityType, entityId, fileName: file.name, size: file.size, mimeType: file.type };
    const prepared = await prepareDocumentUploadAction(meta);
    if (!prepared.ok) {
      toast.error(`${file.name}: ${actionErrorMessage(t, prepared.error)}`);
      return false;
    }
    const { error } = await createClient().storage.from("documents").uploadToSignedUrl(prepared.data.path, prepared.data.token, file, { contentType: file.type });
    if (error) {
      toast.error(`${file.name}: ${t.documents.uploadFailed}`);
      return false;
    }
    const done = await finalizeDocumentUploadAction({ ...meta, path: prepared.data.path, clientVisible: false });
    if (!done.ok) {
      const key = done.fieldErrors?.file;
      if (key) return fileError(key);
      toast.error(`${file.name}: ${actionErrorMessage(t, done.error)}`);
      return false;
    }
    return true;
  }

  async function onFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (inputRef.current) inputRef.current.value = "";
    if (files.length === 0) return;
    setUploading(files.map((f) => f.name));
    let uploaded = 0;
    for (const file of files) {
      if (await uploadOne(file)) uploaded += 1;
      setUploading((names) => names.slice(1));
    }
    setUploading([]);
    if (uploaded > 0) {
      toast.success(interpolate(t.documents.uploaded, { count: uploaded }));
      router.refresh();
    }
  }

  async function download(doc: DocumentCardRow) {
    const result = await getDocumentDownloadUrlAction(doc.id);
    if (!result.ok) {
      toast.error(actionErrorMessage(t, result.error));
      return;
    }
    window.location.assign(result.data.url);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Paperclip aria-hidden="true" className="size-4 text-primary" />
            {t.documents.title}
          </CardTitle>
          <CardDescription>{t.documents.description}</CardDescription>
        </div>
        {canWrite ? (
          <>
            <input ref={inputRef} type="file" multiple accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void onFiles(e.target.files)} />
            <Button variant="secondary" size="sm" loading={uploading.length > 0} onClick={() => inputRef.current?.click()}>
              <Upload aria-hidden="true" />
              {t.documents.upload}
            </Button>
          </>
        ) : null}
      </CardHeader>
      <CardContent>
        {uploading.length > 0 ? (
          <p className="mb-3 flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            {interpolate(t.documents.uploading, { name: uploading[0]! })}
          </p>
        ) : null}
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">{canWrite ? t.documents.emptyWrite : t.documents.empty}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {documents.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <FileIcon mime={d.mime_type} />
                <span className="min-w-0 flex-1">
                  <button type="button" onClick={() => void download(d)} className="block max-w-full truncate text-left text-sm font-medium hover:text-primary hover:underline">
                    {d.file_name}
                  </button>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    {formatFileSize(d.size_bytes, locale)} · {formatDate(d.created_at.slice(0, 10), locale)}
                    {d.is_client_visible ? (
                      <Badge variant="primary" className="px-1.5 py-0 text-[11px]">
                        {t.documents.clientVisible}
                      </Badge>
                    ) : null}
                  </span>
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={interpolate(t.documents.actions, { name: d.file_name })}>
                      <MoreHorizontal aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => void download(d)}>
                      <Download aria-hidden="true" />
                      {t.documents.download}
                    </DropdownMenuItem>
                    {canWrite ? (
                      <DropdownMenuItem
                        onSelect={() => void run(() => setDocumentClientVisibleAction(d.id, !d.is_client_visible), d.is_client_visible ? t.documents.hiddenFromClient : t.documents.sharedWithClient)}
                      >
                        {d.is_client_visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                        {d.is_client_visible ? t.documents.hideFromClient : t.documents.shareWithClient}
                      </DropdownMenuItem>
                    ) : null}
                    {canDelete ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-danger" onSelect={() => setConfirm(d)}>
                          <Trash2 aria-hidden="true" />
                          {t.common.delete}
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <Dialog open={confirm !== null} onOpenChange={(open) => (open ? null : setConfirm(null))}>
        <DialogContent hideClose>
          <DialogHeader>
            <DialogTitle>{t.documents.deleteTitle}</DialogTitle>
            <DialogDescription>{interpolate(t.documents.deleteBody, { name: confirm?.file_name ?? "" })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirm(null)} disabled={deleting}>
              {t.common.cancel}
            </Button>
            <Button
              variant="danger"
              loading={deleting}
              onClick={async () => {
                if (!confirm) return;
                setDeleting(true);
                await run(() => deleteDocumentAction(confirm.id), t.documents.deleted);
                setDeleting(false);
                setConfirm(null);
              }}
            >
              {t.common.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
