/** Parses a `?page=` search param into a positive integer (defaults to 1). */
export function parsePageParam(value: string | string[] | undefined, max = 10_000): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, max);
}
