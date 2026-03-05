import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

type ModuleRouteComponent = LazyExoticComponent<ComponentType<any>>;

const iamModuleRouteKeys = [
  'auditLogs',
] as const;

export type IAMModuleRouteKey = (typeof iamModuleRouteKeys)[number];
export type IAMModuleRoutes = Record<IAMModuleRouteKey, ModuleRouteComponent>;

export const iamModuleRoutes: IAMModuleRoutes = {
  auditLogs: lazy(() => import('./pages/AuditLogs')),
};
