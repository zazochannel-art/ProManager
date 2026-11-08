import { createHash, randomBytes } from "node:crypto";

/** 256-bit random invitation token; only its SHA-256 hash is stored in the database. */
export function createInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInvitationToken(token) };
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
