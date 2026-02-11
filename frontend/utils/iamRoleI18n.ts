export type AppLocale = 'zh-CN' | 'en-US';

type BuiltinRoleLocaleMeta = {
  name: Record<AppLocale, string>;
  description: Record<AppLocale, string>;
};

const ROLE_ALIAS_MAP: Record<string, string> = {
  portal_admin: 'portaladmin',
};

const BUILTIN_ROLE_META: Record<string, BuiltinRoleLocaleMeta> = {
  user: {
    name: {
      'zh-CN': '普通用户',
      'en-US': 'Regular User',
    },
    description: {
      'zh-CN': '默认门户用户',
      'en-US': 'Default portal user',
    },
  },
  portaladmin: {
    name: {
      'zh-CN': '门户管理员',
      'en-US': 'Portal Administrator',
    },
    description: {
      'zh-CN': '门户后台管理员角色',
      'en-US': 'Portal admin role for backend console',
    },
  },
  superadmin: {
    name: {
      'zh-CN': '系统超级管理员',
      'en-US': 'System Super Administrator',
    },
    description: {
      'zh-CN': '系统超级管理员角色',
      'en-US': 'System super administrator role',
    },
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
    name: builtin.name[locale] || role.name || role.code,
    description: builtin.description[locale] || role.description || '',
  };
};
