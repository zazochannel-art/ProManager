/**
 * Pure selection logic for the active organization. A requested id (from the
 * cookie) is only honoured when it belongs to the user's memberships.
 */
export function resolveActiveOrganizationId(input: {
  requested: string | null | undefined;
  lastUsed: string | null | undefined;
  memberIds: readonly string[];
}): string | null {
  const { requested, lastUsed, memberIds } = input;
  if (requested && memberIds.includes(requested)) return requested;
  if (lastUsed && memberIds.includes(lastUsed)) return lastUsed;
  return memberIds[0] ?? null;
}
