import { NextResponse } from "next/server";

/** Liveness probe for load balancers / uptime monitors. Reveals no configuration. */
export function GET() {
  return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
