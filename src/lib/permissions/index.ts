import { PERMISSIONS, ROLES, type Permission, type Role } from "./matrix";

export { PERMISSIONS, ROLES, ALL_PERMISSIONS, type Permission, type Role } from "./matrix";

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Pure check against the mirrored matrix (UI + fail-fast server checks). */
export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export function permissionsForRole(role: Role): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter((p) => can(role, p));
}

export class PermissionError extends Error {
  readonly permission: Permission;
  constructor(permission: Permission) {
    super(`Missing permission: ${permission}`);
    this.name = "PermissionError";
    this.permission = permission;
  }
}

export function assertCan(role: Role | null | undefined, permission: Permission): asserts role is Role {
  if (!can(role, permission)) throw new PermissionError(permission);
}

/** Roles a member with `actorRole` may assign to others. Owners only via owners. */
export function assignableRoles(actorRole: Role): Role[] {
  if (actorRole === "owner") return [...ROLES];
  // Owner and admin are owner-managed (enforced by private.guard_member_changes).
  if (actorRole === "admin") return ROLES.filter((r) => r !== "owner" && r !== "admin");
  return [];
}
