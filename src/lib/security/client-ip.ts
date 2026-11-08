/**
 * Picks the client address from X-Forwarded-For without trusting what the
 * client wrote. Each proxy APPENDS the address it saw, so with N trusted
 * proxies in front of the app the real client is the N-th entry from the
 * RIGHT; everything left of it is client-controlled and ignored.
 * hops = 0 means "no trusted proxy": forwarding headers are ignored entirely.
 */
export function pickClientIp(forwardedFor: string | null, realIp: string | null, trustedHops: number): string {
  if (trustedHops <= 0) return "unknown";
  const chain = (forwardedFor ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const candidate = chain.length >= trustedHops ? chain[chain.length - trustedHops] : chain.length === 0 ? realIp?.trim() : chain[0];
  return (candidate || "unknown").slice(0, 64);
}
