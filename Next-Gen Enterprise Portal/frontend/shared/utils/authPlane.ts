export type AuthPlane = 'portal' | 'admin';

const AUTH_PLANE_STORAGE_KEY = 'activeAuthPlane';

const isAuthPlane = (value: string | null | undefined): value is AuthPlane =>
  value === 'portal' || value === 'admin';

export const resolveExplicitAuthPlaneFromPath = (pathname: string): AuthPlane | null => {
  if (pathname === '/admin/login') return 'admin';
  if (pathname === '/login') return 'portal';
  return null;
};

export const getPreferredAuthPlane = (pathname?: string): AuthPlane => {
  if (typeof window === 'undefined') {
    return 'portal';
  }

  const effectivePath = pathname || window.location.pathname;
  const explicitPlane = resolveExplicitAuthPlaneFromPath(effectivePath);
  if (explicitPlane) {
    return explicitPlane;
  }

  const storedPlane = window.sessionStorage.getItem(AUTH_PLANE_STORAGE_KEY);
  if (isAuthPlane(storedPlane)) {
    return storedPlane;
  }

  if (effectivePath.startsWith('/admin')) {
    return 'admin';
  }

  return 'portal';
};

export const setPreferredAuthPlane = (plane: AuthPlane): void => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(AUTH_PLANE_STORAGE_KEY, plane);
};

export const resolveLoginPathForPlane = (plane: AuthPlane): '/login' | '/admin/login' =>
  plane === 'admin' ? '/admin/login' : '/login';

export const resolveHomePathForPlane = (plane: AuthPlane): '/' | '/admin' =>
  plane === 'admin' ? '/admin' : '/';
