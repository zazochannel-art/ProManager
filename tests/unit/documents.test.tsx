import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n/client";
import { en } from "@/lib/i18n/dictionaries/en";
import { finalizeUploadSchema, formatFileSize, isOwnDocumentPath, prepareUploadSchema } from "@/features/documents/schemas/files";

vi.mock("@/features/documents/actions/document-actions", () => ({
  prepareDocumentUploadAction: vi.fn(),
  finalizeDocumentUploadAction: vi.fn(),
  getDocumentDownloadUrlAction: vi.fn(),
  setDocumentClientVisibleAction: vi.fn(),
  deleteDocumentAction: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/" }));

const { DocumentsCard } = await import("@/features/documents/components/documents-card");

const ORG = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";
const FILE = "33333333-3333-4333-8333-333333333333";

describe("document paths and limits", () => {
  const folder = `${ORG}/project/${PROJECT}/`;
  it("accepts only files in the record's own folder", () => {
    expect(isOwnDocumentPath(`${folder}${FILE}-contract.pdf`, ORG, "project", PROJECT)).toBe(true);
    expect(isOwnDocumentPath(`${folder}${FILE}-contract.pdf`, ORG, "customer", PROJECT)).toBe(false);
    expect(isOwnDocumentPath(`${PROJECT}/project/${PROJECT}/${FILE}-a.pdf`, ORG, "project", PROJECT)).toBe(false);
    expect(isOwnDocumentPath(`${folder}contract.pdf`, ORG, "project", PROJECT)).toBe(false);
    expect(isOwnDocumentPath(`${folder}${FILE}-../x.pdf`, ORG, "project", PROJECT)).toBe(false);
    expect(isOwnDocumentPath(`${folder}${FILE}-a/b.pdf`, ORG, "project", PROJECT)).toBe(false);
  });

  it("checks size and type before uploading", () => {
    const base = { entityType: "project", entityId: PROJECT, fileName: "plan.pdf", size: 1000, mimeType: "application/pdf" };
    expect(prepareUploadSchema.safeParse(base).success).toBe(true);
    expect(prepareUploadSchema.safeParse({ ...base, size: 26 * 1024 * 1024 }).error?.issues[0]?.message).toBe("fileTooLarge");
    expect(prepareUploadSchema.safeParse({ ...base, mimeType: "application/x-msdownload" }).error?.issues[0]?.message).toBe("fileType");
    expect(prepareUploadSchema.safeParse({ ...base, entityType: "invoice" }).success).toBe(false);
    expect(finalizeUploadSchema.parse({ ...base, path: "x" }).clientVisible).toBe(false);
  });

  it("formats sizes for people", () => {
    expect(formatFileSize(512, "en")).toBe("512 B");
    expect(formatFileSize(1536, "en")).toBe("1.5 KB");
    expect(formatFileSize(5 * 1024 * 1024, "ro")).toBe("5 MB");
  });
});

describe("DocumentsCard", () => {
  const doc = { id: FILE, file_name: "contract.pdf", mime_type: "application/pdf", size_bytes: 2048, is_client_visible: true, created_at: "2026-11-01T10:00:00Z" };
  const renderCard = (canWrite: boolean, canDelete: boolean, documents = [doc]) =>
    render(
      <I18nProvider locale="en" dictionary={en}>
        <DocumentsCard entityType="project" entityId={PROJECT} documents={documents} canWrite={canWrite} canDelete={canDelete} />
      </I18nProvider>,
    );

  it("shows only download to people who can read", async () => {
    renderCard(false, false);
    expect(screen.queryByRole("button", { name: "Upload" })).not.toBeInTheDocument();
    expect(screen.getByText("Visible to client")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Actions for contract.pdf" }));
    expect(screen.getByRole("menuitem", { name: "Download" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Hide from the client" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("offers upload, sharing and delete when allowed", async () => {
    renderCard(true, true);
    expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Actions for contract.pdf" }));
    expect(screen.getByRole("menuitem", { name: "Hide from the client" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
  });

  it("explains what can be uploaded when empty", () => {
    renderCard(true, false, []);
    expect(screen.getByText(/up to 25 MB/)).toBeInTheDocument();
  });
});
