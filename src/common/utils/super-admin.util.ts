/** Role name that receives unrestricted access (matches "super admin", "Super Admin", etc.). */
export function isSuperAdminRole(
  role?: { name?: string | null } | null,
): boolean {
  const normalized = (role?.name ?? '').toLowerCase().replace(/\s+/g, '');
  return normalized === 'superadmin';
}
