/**
 * Upload validation: size limit, MIME allow-list AND content sniffing (magic
 * bytes), so a renamed executable cannot pass as a PDF or image.
 */
export interface UploadPolicy {
  maxBytes: number;
  allowedMimeTypes: readonly string[];
}

export const UPLOAD_POLICIES = {
  logo: { maxBytes: 2 * 1024 * 1024, allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"] },
  document: {
    maxBytes: 25 * 1024 * 1024,
    allowedMimeTypes: [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/webp",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
    ],
  },
} as const satisfies Record<string, UploadPolicy>;

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/csv": "csv",
};

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((b, i) => bytes[offset + i] === b);
}

/** Detects the real file type from its first bytes. */
export function sniffMimeType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return "application/zip"; // docx / xlsx containers
  return null;
}

function looksLikeText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, 4096);
  for (const b of sample) {
    if (b === 0) return false;
  }
  return true;
}

export type FileValidationError = "empty" | "too_large" | "type_not_allowed" | "content_mismatch";

export function validateUpload(
  file: { size: number; type: string; name: string },
  head: Uint8Array,
  policy: UploadPolicy,
): { ok: true; mimeType: string; extension: string } | { ok: false; error: FileValidationError } {
  if (file.size <= 0) return { ok: false, error: "empty" };
  if (file.size > policy.maxBytes) return { ok: false, error: "too_large" };
  const declared = file.type.toLowerCase();
  if (!policy.allowedMimeTypes.includes(declared)) return { ok: false, error: "type_not_allowed" };

  const sniffed = sniffMimeType(head);
  const isOfficeXml = declared.startsWith("application/vnd.openxmlformats-officedocument.");
  const matches =
    declared === "text/csv" ? sniffed === null && looksLikeText(head) : isOfficeXml ? sniffed === "application/zip" : sniffed === declared;
  if (!matches) return { ok: false, error: "content_mismatch" };

  return { ok: true, mimeType: declared, extension: EXTENSION_BY_MIME[declared] ?? "bin" };
}

/** Produces a safe storage file name (no path traversal, no control chars). */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 100);
  return cleaned || "file";
}
