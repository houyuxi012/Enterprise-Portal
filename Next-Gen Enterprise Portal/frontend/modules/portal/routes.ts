import { lazy } from 'react';

export const portalModuleRoutes = {
  login: lazy(() => import('./pages/Login')),
  security: lazy(() => import('./pages/PortalSecurity')),
  todos: lazy(() => import('./pages/Todos')),
} as const;
