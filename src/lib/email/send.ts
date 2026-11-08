import "server-only";
import { getServerEnv } from "@/config/server-env";
import { logger } from "@/lib/security/logger";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type SendEmailResult = { sent: true } | { sent: false; reason: "not_configured" | "provider_error" };

/**
 * Sends transactional e-mail through Resend's HTTP API when RESEND_API_KEY and
 * EMAIL_FROM are configured. Returns { sent: false, reason: "not_configured" }
 * otherwise, so callers can show a fallback (e.g. a copyable invite link)
 * instead of pretending an e-mail was sent.
 */
export async function sendEmail(message: EmailMessage): Promise<SendEmailResult> {
  const { RESEND_API_KEY, EMAIL_FROM } = getServerEnv();
  if (!RESEND_API_KEY || !EMAIL_FROM) return { sent: false, reason: "not_configured" };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      logger.error("email.send_failed", { status: response.status });
      return { sent: false, reason: "provider_error" };
    }
    return { sent: true };
  } catch (error) {
    logger.error("email.send_failed", { error });
    return { sent: false, reason: "provider_error" };
  }
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}
