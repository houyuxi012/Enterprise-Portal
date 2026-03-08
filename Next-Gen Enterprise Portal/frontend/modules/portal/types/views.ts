export enum AppView {
  DASHBOARD = 'dashboard',
  NEWS = 'news',
  DIRECTORY = 'directory',
  RESOURCES = 'resources',
  SETTINGS = 'settings',
  TOOLS = 'tools',
  SEARCH_RESULTS = 'search_results',
  TODOS = 'todos',
  MEETINGS = 'meetings',
  SECURITY = 'security',
}

export const PORTAL_PRIMARY_NAV_VIEWS = [
  AppView.DASHBOARD,
  AppView.NEWS,
  AppView.DIRECTORY,
  AppView.TOOLS,
] as const;

export type PortalPrimaryNavView = (typeof PORTAL_PRIMARY_NAV_VIEWS)[number];
