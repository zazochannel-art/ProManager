"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { logger } from "@/lib/security/logger";
import { sanitizeFileName, validateUpload } from "@/lib/validation/file";
import { fail, mapDatabaseError, ok, validationFailure, type ActionResult } from "@/lib/validation/action-result";
import { withDocumentContext } from "@/features/invoicing/actions/shared";
import {
  DOCUMENT_POLICY,
  FILE_ERROR_KEYS,
  documentFolder,
  finalizeUploadSchema,
  isOwnDocumentPath,
  prepareUploadSchema,
  type DocumentEntity,
  type FinalizeUploadInput,
  type PrepareUploadInput,
} from "../schemas/files";

/**
 * Project and customer files in the private `documents` bucket.
 *
 * Files go straight from the browser to Storage through a signed upload URL
 * (Server Actions cap request bodies far below the 25 MB file limit). The
 * URL is created with the member's own session, so storage RLS
 * (documents.write) decides who may upload. Before the metadata row is
 * written, the stored object is checked again here: its real size and its
 * first bytes (magic bytes) must match an allowed type, otherwise it is
 * removed.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;
const BUCKET = "documents";
const pagePath = (entityType: DocumentEntity, entityId: string) => (entityType === "project" ? `/dashboard/projects/${entityId}` : `/dashboard/customers/${entityId}`);

/** The project or customer must exist in this organization; returns the customer to link the file to. */
async function loadEntity(supabase: Supabase, organizationId: string, entityType: DocumentEntity, entityId: string) {
  if (entityType === "project") {
    const { data, error } = await supabase.from("projects").select("id, customer_id").eq("organization_id", organizationId).eq("id", entityId).is("deleted_at", null).maybeSingle();
    if (error) throw new Error(`Failed to load project: ${error.message}`);
    return data ? { projectId: data.id, customerId: data.customer_id } : null;
  }
  const { data, error } = await supabase.from("customers").select("id").eq("organization_id", organizationId).eq("id", entityId).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(`Failed to load customer: ${error.message}`);
  return data ? { projectId: null, customerId: data.id } : null;
}

export async function prepareDocumentUploadAction(input: PrepareUploadInput): Promise<ActionResult<{ path: string; uploadUrl: string }>> {
  return withDocumentContext("documents.write", [], async (ctx) => {
    if (!checkRateLimit("upload", ctx.user.id).allowed) return fail("rate_limited");
    const parsed = prepareUploadSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const v = parsed.data;
    const supabase = await createClient();
    if (!(await loadEntity(supabase, ctx.organization.id, v.entityType, v.entityId))) return fail("not_found");
    const path = `${documentFolder(ctx.organization.id, v.entityType, v.entityId)}${randomUUID()}-${sanitizeFileName(v.fileName)}`;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      logger.warn("documents.signed_upload_failed", { organizationId: ctx.organization.id, message: error?.message });
      return fail("forbidden");
    }
    return ok({ path: data.path, uploadUrl: data.signedUrl });
  });
}

export async function finalizeDocumentUploadAction(input: FinalizeUploadInput): Promise<ActionResult<{ id: string }>> {
  return withDocumentContext("documents.write", [], async (ctx) => {
    const parsed = finalizeUploadSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const v = parsed.data;
    if (!isOwnDocumentPath(v.path, ctx.organization.id, v.entityType, v.entityId)) return fail("validation");
    const supabase = await createClient();
    const storage = supabase.storage.from(BUCKET);
    const discard = async () => {
      const { error } = await storage.remove([v.path]);
      if (error) logger.warn("documents.discard_failed", { path: v.path, message: error.message });
    };

    const entity = await loadEntity(supabase, ctx.organization.id, v.entityType, v.entityId);
    if (!entity) {
      await discard();
      return fail("not_found");
    }
    const { data: info, error: infoError } = await storage.info(v.path);
    if (infoError || !info) return fail("not_found");
    const size = Number(info.size ?? 0);

    // Check the stored bytes, not what the browser claimed.
    const { data: signed, error: signError } = await storage.createSignedUrl(v.path, 60);
    if (signError || !signed) return fail("server");
    const response = await fetch(signed.signedUrl, { headers: { Range: "bytes=0-4095" }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return fail("server");
    const head = new Uint8Array(await response.arrayBuffer()).subarray(0, 4096);
    const check = validateUpload({ size, type: v.mimeType, name: v.fileName }, head, DOCUMENT_POLICY);
    if (!check.ok) {
      await discard();
      return fail("validation", { fieldErrors: { file: FILE_ERROR_KEYS[check.error] } });
    }

    const { data, error } = await supabase
      .from("documents")
      .insert({
        organization_id: ctx.organization.id,
        bucket: BUCKET,
        storage_path: v.path,
        file_name: v.fileName,
        mime_type: check.mimeType,
        size_bytes: size,
        entity_type: v.entityType,
        entity_id: v.entityId,
        project_id: entity.projectId,
        customer_id: entity.customerId,
        is_client_visible: v.clientVisible,
        uploaded_by: ctx.user.id,
      })
      .select("id")
      .single();
    if (error) {
      await discard();
      return fail(mapDatabaseError(error));
    }
    revalidatePath(pagePath(v.entityType, v.entityId));
    return ok({ id: data.id });
  });
}

async function loadDocument(supabase: Supabase, organizationId: string, id: string) {
  const { data, error } = await supabase
    .from("documents")
    .select("id, storage_path, file_name, entity_type, entity_id")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .eq("bucket", BUCKET)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`Failed to load document: ${error.message}`);
  return data;
}

function revalidateEntity(doc: { entity_type: string | null; entity_id: string | null }) {
  if ((doc.entity_type === "project" || doc.entity_type === "customer") && doc.entity_id) revalidatePath(pagePath(doc.entity_type, doc.entity_id));
}

/** A one-minute signed link that downloads the file under its original name. */
export async function getDocumentDownloadUrlAction(documentId: string): Promise<ActionResult<{ url: string }>> {
  return withDocumentContext("documents.read", [documentId], async (ctx, [id]) => {
    const supabase = await createClient();
    const doc = await loadDocument(supabase, ctx.organization.id, id!);
    if (!doc) return fail("not_found");
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(doc.storage_path, 60, { download: doc.file_name });
    if (error || !data) return fail("not_found");
    return ok({ url: data.signedUrl });
  });
}

export async function setDocumentClientVisibleAction(documentId: string, visible: boolean): Promise<ActionResult> {
  return withDocumentContext("documents.write", [documentId], async (ctx, [id]) => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("documents")
      .update({ is_client_visible: visible === true })
      .eq("organization_id", ctx.organization.id)
      .eq("id", id!)
      .is("deleted_at", null)
      .select("entity_type, entity_id");
    if (error) return fail(mapDatabaseError(error));
    if (!data || data.length === 0) return fail("not_found");
    revalidateEntity(data[0]!);
    return ok(undefined);
  });
}

/** Deletes the stored file, then its row (RLS and storage policies: documents.delete). */
export async function deleteDocumentAction(documentId: string): Promise<ActionResult> {
  return withDocumentContext("documents.delete", [documentId], async (ctx, [id]) => {
    const supabase = await createClient();
    const doc = await loadDocument(supabase, ctx.organization.id, id!);
    if (!doc) return fail("not_found");
    const { error: storageError } = await supabase.storage.from(BUCKET).remove([doc.storage_path]);
    if (storageError) {
      logger.warn("documents.remove_failed", { organizationId: ctx.organization.id, message: storageError.message });
      return fail("forbidden");
    }
    const { data, error } = await supabase.from("documents").delete().eq("organization_id", ctx.organization.id).eq("id", doc.id).select("id");
    if (error) return fail(mapDatabaseError(error));
    if (!data || data.length === 0) return fail("forbidden");
    revalidateEntity(doc);
    return ok(undefined);
  });
}
