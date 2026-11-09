import { z } from "zod";
import { uuidField } from "@/lib/validation/common";
import { UPLOAD_POLICIES, type FileValidationError } from "@/lib/validation/file";

/** Records that have a Documents card. */
export const DOCUMENT_ENTITIES = ["project", "customer"] as const;
export type DocumentEntity = (typeof DOCUMENT_ENTITIES)[number];

export const DOCUMENT_POLICY = UPLOAD_POLICIES.document;

/** Validation message keys for upload failures (see t.validation). */
export const FILE_ERROR_KEYS: Record<FileValidationError, "fileEmpty" | "fileTooLarge" | "fileType" | "fileContent"> = {
  empty: "fileEmpty",
  too_large: "fileTooLarge",
  type_not_allowed: "fileType",
  content_mismatch: "fileContent",
};

const fileFields = {
  entityType: z.enum(DOCUMENT_ENTITIES, { error: "invalidOption" }),
  entityId: uuidField,
  fileName: z.string().trim().min(1, { error: "required" }).max(255, { error: "max:255" }),
  size: z.number().int().positive({ error: "fileEmpty" }).max(DOCUMENT_POLICY.maxBytes, { error: "fileTooLarge" }),
  mimeType: z
    .string()
    .toLowerCase()
    .refine((v) => (DOCUMENT_POLICY.allowedMimeTypes as readonly string[]).includes(v), { error: "fileType" }),
};

export const prepareUploadSchema = z.object(fileFields);
export type PrepareUploadInput = z.input<typeof prepareUploadSchema>;

export const finalizeUploadSchema = z.object({ ...fileFields, path: z.string().min(1).max(500), clientVisible: z.boolean().default(false) });
export type FinalizeUploadInput = z.input<typeof finalizeUploadSchema>;

/** Storage path: <org>/<entity>/<entity id>/<uuid>-<safe name>. Anything else is refused. */
export function documentFolder(organizationId: string, entityType: DocumentEntity, entityId: string): string {
  return `${organizationId}/${entityType}/${entityId}/`;
}

export function isOwnDocumentPath(path: string, organizationId: string, entityType: DocumentEntity, entityId: string): boolean {
  const folder = documentFolder(organizationId, entityType, entityId);
  if (!path.startsWith(folder)) return false;
  const rest = path.slice(folder.length);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[\w.\- ]{1,100}$/.test(rest) && !rest.includes("..");
}

export function formatFileSize(bytes: number, locale: string): string {
  const units = ["B", "KB", "MB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: unit === 0 ? 0 : 1 }).format(value)} ${units[unit]}`;
}
