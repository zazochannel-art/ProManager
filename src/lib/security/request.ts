import "server-only";
import { headers } from "next/headers";
import { getServerEnv } from "@/config/server-env";
import { pickClientIp } from "./client-ip";

/** Client identifier for rate limiting. Configure TRUSTED_PROXY_HOPS (default 1: one platform proxy, e.g. Vercel). */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  return pickClientIp(h.get("x-forwarded-for"), h.get("x-real-ip"), getServerEnv().TRUSTED_PROXY_HOPS);
}
