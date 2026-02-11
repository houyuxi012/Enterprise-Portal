import { normalizeRoleCode } from './iamRoleI18n';

type AdminAccessUser = {
  account_type?: string;
  permissions?: string[];
  roles?: Array<{ code?: string }>;
} | null | undefined;

const normalizePermission = (code: string): string => {
  const value = (code || '').trim();
  return value.startsWith('portal.') ? value.slice(7) : value;
};

export const hasAdminAccess = (user: AdminAccessUser): boolean => {
  if (!user) return false;

  if ((user.account_type || '').toUpperCase() === 'SYSTEM') {
    return true;
  }

  if ((user.permissions || []).some((code) => normalizePermission(code) === 'admin:access')) {
    return true;
  }

  const adminRoleCodes = new Set(['portaladmin', 'superadmin']);
  return (user.roles || []).some((role) => adminRoleCodes.has(normalizeRoleCode(role.code)));
};
