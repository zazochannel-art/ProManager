import "server-only";
import type { ServerSupabaseClient } from "@/lib/supabase/server";
import type { DocumentEntity } from "../schemas/files";

export interface DocumentRow {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  is_client_visible: boolean;
  created_at: string;
}

/** Files attached to a project or customer (RLS: documents.read). */
export async function listEntityDocuments(supabase: ServerSupabaseClient, organizationId: string, entityType: DocumentEntity, entityId: string): Promise<DocumentRow[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("id, file_name, mime_type, size_bytes, is_client_visible, created_at")
    .eq("organization_id", organizationId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`Failed to list documents: ${error.message}`);
  return data ?? [];
}
