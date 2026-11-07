import "server-only";
import { headers } from "next/headers";

/** Best-effort client identifier for rate limiting (first X-Forwarded-For hop). */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return ip.slice(0, 64);
}
