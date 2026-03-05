import { lazy } from 'react';

export const iamModuleRoutes = {
  auditLogs: lazy(() => import('./pages/AuditLogs')),
} as const;
