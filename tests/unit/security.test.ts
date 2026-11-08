import { describe, expect, it } from "vitest";
import { MemoryRateLimitStore, checkRateLimit } from "@/lib/security/rate-limit";
import { redact } from "@/lib/security/logger";
import { pickClientIp } from "@/lib/security/client-ip";
import { sanitizeFileName, sniffMimeType, validateUpload, UPLOAD_POLICIES } from "@/lib/validation/file";
import { escapeHtml } from "@/lib/email/send";
import { mapDatabaseError } from "@/lib/validation/action-result";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const PDF = new TextEncoder().encode("%PDF-1.7\n");

describe("rate limiting", () => {
  it("blocks after the limit and resets after the window", () => {
    const store = new MemoryRateLimitStore();
    const now = 1_000_000;
    for (let i = 0; i < 10; i++) expect(checkRateLimit("signIn", "1.2.3.4", { store, now }).allowed).toBe(true);
    const blocked = checkRateLimit("signIn", "1.2.3.4", { store, now });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(checkRateLimit("signIn", "5.6.7.8", { store, now }).allowed).toBe(true);
    expect(checkRateLimit("signIn", "1.2.3.4", { store, now: now + 60_001 }).allowed).toBe(true);
  });

  it("stays bounded in memory", () => {
    const store = new MemoryRateLimitStore(5);
    for (let i = 0; i < 50; i++) store.increment(`k${i}`, 60_000, 0);
    expect((store as unknown as { buckets: Map<string, unknown> }).buckets.size).toBeLessThanOrEqual(5);
  });
});

describe("log redaction", () => {
  it("redacts secrets and masks e-mails", () => {
    const out = redact({ password: "hunter2", accessToken: "abc", email: "maria.popescu@example.com", nested: { apiKey: "x", ok: 1 } });
    expect(out).toEqual({ password: "[redacted]", accessToken: "[redacted]", email: "m***@example.com", nested: { apiKey: "[redacted]", ok: 1 } });
  });
});

describe("upload validation", () => {
  it("accepts a real PNG logo", () => {
    expect(validateUpload({ size: 1000, type: "image/png", name: "logo.png" }, PNG, UPLOAD_POLICIES.logo)).toEqual({
      ok: true,
      mimeType: "image/png",
      extension: "png",
    });
  });

  it("rejects disguised, oversized, empty and disallowed files", () => {
    expect(validateUpload({ size: 1000, type: "image/png", name: "x.png" }, PDF, UPLOAD_POLICIES.logo)).toEqual({ ok: false, error: "content_mismatch" });
    expect(validateUpload({ size: 3 * 1024 * 1024, type: "image/png", name: "x.png" }, PNG, UPLOAD_POLICIES.logo)).toEqual({ ok: false, error: "too_large" });
    expect(validateUpload({ size: 0, type: "image/png", name: "x.png" }, PNG, UPLOAD_POLICIES.logo)).toEqual({ ok: false, error: "empty" });
    expect(validateUpload({ size: 10, type: "image/svg+xml", name: "x.svg" }, PNG, UPLOAD_POLICIES.logo)).toEqual({ ok: false, error: "type_not_allowed" });
    expect(validateUpload({ size: 10, type: "application/pdf", name: "x.pdf" }, PDF, UPLOAD_POLICIES.document).ok).toBe(true);
  });

  it("sniffs magic bytes and sanitises names", () => {
    expect(sniffMimeType(PNG)).toBe("image/png");
    expect(sniffMimeType(PDF)).toBe("application/pdf");
    expect(sniffMimeType(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("Factură finală 2026.pdf")).toBe("Factura-finala-2026.pdf");
    expect(sanitizeFileName("...")).toBe("file");
  });
});

describe("misc security helpers", () => {
  it("escapes HTML in e-mails", () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
  });

  it("maps database errors to safe codes", () => {
    expect(mapDatabaseError({ code: "42501" })).toBe("forbidden");
    expect(mapDatabaseError({ code: "23505" })).toBe("conflict");
    expect(mapDatabaseError({ code: "54000" })).toBe("limit_reached");
    expect(mapDatabaseError({ code: "XX000" })).toBe("server");
  });
});

describe("client IP for rate limiting", () => {
  it("ignores client-written X-Forwarded-For entries left of the trusted proxies", () => {
    // Client sent "6.6.6.6"; the platform proxy appended the real address.
    expect(pickClientIp("6.6.6.6, 203.0.113.7", null, 1)).toBe("203.0.113.7");
    expect(pickClientIp("6.6.6.6, 203.0.113.7, 10.0.0.2", null, 2)).toBe("203.0.113.7");
  });
  it("falls back to X-Real-IP and ignores headers when no proxy is trusted", () => {
    expect(pickClientIp(null, "198.51.100.4", 1)).toBe("198.51.100.4");
    expect(pickClientIp("6.6.6.6", "198.51.100.4", 0)).toBe("unknown");
    expect(pickClientIp(null, null, 1)).toBe("unknown");
  });
});
