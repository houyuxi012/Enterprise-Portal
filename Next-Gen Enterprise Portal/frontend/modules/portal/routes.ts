import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

type ModuleRouteComponent = LazyExoticComponent<ComponentType<any>>;

const portalModuleRouteKeys = [
  'login',
  'security',
  'todos',
] as const;

export type PortalModuleRouteKey = (typeof portalModuleRouteKeys)[number];
export type PortalModuleRoutes = Record<PortalModuleRouteKey, ModuleRouteComponent>;

export const portalModuleRoutes: PortalModuleRoutes = {
  login: lazy(() => import('./pages/Login')),
  security: lazy(() => import('./pages/PortalSecurity')),
  todos: lazy(() => import('./pages/Todos')),
};
