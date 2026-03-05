import { adminModuleRoutes } from '../modules/admin/routes';
import { iamModuleRoutes } from '../modules/iam/routes';
import { portalModuleRoutes } from '../modules/portal/routes';

export const moduleRouteRegistry = {
  admin: adminModuleRoutes,
  iam: iamModuleRoutes,
  portal: portalModuleRoutes,
} as const;
