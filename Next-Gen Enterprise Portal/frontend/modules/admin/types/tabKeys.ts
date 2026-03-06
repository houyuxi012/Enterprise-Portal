export const ADMIN_TAB_KEYS = [
  'dashboard',
  'news',
  'announcements',
  'employees',
  'users',
  'online_users',
  'directories',
  'tools',
  'app_permissions',
  'meeting_local',
  'meeting_sync',
  'settings',
  'platform_settings',
  'license',
  'about_us',
  'org',
  'roles',
  'system_logs',
  'business_logs',
  'access_logs',
  'ai_audit',
  'log_forwarding',
  'log_storage',
  'carousel',
  'security',
  'password_policy',
  'mfa_settings',
  'ai_models',
  'ai_security',
  'ai_settings',
  'ai_usage',
  'iam_audit_logs',
  'kb_manage',
  'todos',
  'notification_templates',
  'notification_services',
  'third_party_notifications',
] as const;

export type AdminTabKey = (typeof ADMIN_TAB_KEYS)[number];

export const ADMIN_DEFAULT_TAB: AdminTabKey = 'dashboard';
export const ADMIN_DIRECTORY_TAB: AdminTabKey = 'directories';

const ADMIN_TAB_KEY_SET = new Set<string>(ADMIN_TAB_KEYS);

export const isAdminTabKey = (value: string | null | undefined): value is AdminTabKey =>
  !!value && ADMIN_TAB_KEY_SET.has(value);
