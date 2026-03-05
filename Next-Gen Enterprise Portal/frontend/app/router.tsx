import { adminModuleRoutes, type AdminModuleRoutes } from '../modules/admin/routes';
import { iamModuleRoutes, type IAMModuleRoutes } from '../modules/iam/routes';
import { portalModuleRoutes, type PortalModuleRoutes } from '../modules/portal/routes';

export interface ModuleRouteRegistry {
  admin: AdminModuleRoutes;
  iam: IAMModuleRoutes;
  portal: PortalModuleRoutes;
}

export const moduleRouteRegistry: ModuleRouteRegistry = {
  admin: adminModuleRoutes,
  iam: iamModuleRoutes,
  portal: portalModuleRoutes,
};
