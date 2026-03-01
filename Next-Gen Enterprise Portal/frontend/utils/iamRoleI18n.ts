import i18n from '../i18n';

export type AppLocale = 'zh-CN' | 'en-US';

type BuiltinRoleLocaleMeta = {
  nameKey: string;
  descriptionKey: string;
  fallbackName: string;
  fallbackDescription: string;
};

const ROLE_ALIAS_MAP: Record<string, string> = {
  portal_admin: 'portaladmin',
};

const BUILTIN_ROLE_META: Record<string, BuiltinRoleLocaleMeta> = {
  user: {
    nameKey: 'iamRoleMeta.builtin.user.name',
    descriptionKey: 'iamRoleMeta.builtin.user.description',
    fallbackName: 'Regular User',
    fallbackDescription: 'Default portal user',
  },
  portaladmin: {
    nameKey: 'iamRoleMeta.builtin.portaladmin.name',
    descriptionKey: 'iamRoleMeta.builtin.portaladmin.description',
    fallbackName: 'Portal Administrator',
    fallbackDescription: 'Portal admin role for backend console',
  },
  superadmin: {
    nameKey: 'iamRoleMeta.builtin.superadmin.name',
    descriptionKey: 'iamRoleMeta.builtin.superadmin.description',
    fallbackName: 'System Super Administrator',
    fallbackDescription: 'System super administrator role',
  },
};

export const normalizeRoleCode = (code?: string): string => {
  const normalized = (code || '').trim().toLowerCase();
  return ROLE_ALIAS_MAP[normalized] || normalized;
};

const normalizeLocale = (locale?: string): AppLocale => {
  const candidate = (locale || '').trim().toLowerCase();
  if (candidate.startsWith('zh')) {
    return 'zh-CN';
  }
  return 'en-US';
};

const translateWithLocale = (key: string, locale: AppLocale, fallback: string): string => {
  const translated = i18n.t(key, { lng: locale, defaultValue: fallback });
  return typeof translated === 'string' && translated.trim() ? translated : fallback;
};

export const getCurrentLocale = (): AppLocale => {
  if (typeof window === 'undefined') {
    return 'zh-CN';
  }

  const fromStorage = window.localStorage.getItem('app_locale') || window.localStorage.getItem('locale');
  if (fromStorage) {
    return normalizeLocale(fromStorage);
  }

  const fromEnv = import.meta.env.VITE_APP_LOCALE as string | undefined;
  if (fromEnv) {
    return normalizeLocale(fromEnv);
  }

  // Default to Chinese unless explicitly configured.
  return 'zh-CN';
};

export const getLocalizedRoleMeta = (
  role: { code: string; name?: string; description?: string },
  locale: AppLocale = getCurrentLocale(),
): { name: string; description: string } => {
  const roleCode = normalizeRoleCode(role.code);
  const builtin = BUILTIN_ROLE_META[roleCode];
  if (!builtin) {
    return {
      name: role.name || role.code,
      description: role.description || '',
    };
  }

  return {
    name: translateWithLocale(builtin.nameKey, locale, builtin.fallbackName) || role.name || role.code,
    description: translateWithLocale(builtin.descriptionKey, locale, builtin.fallbackDescription) || role.description || '',
  };
};
