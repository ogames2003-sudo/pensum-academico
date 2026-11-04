/**
 * Ruta del panel administrativo. Por defecto «/admin»; con VITE_ADMIN_PATH se usa una ruta propia
 * (p. ej. «/gestion-x7k2») y «/admin» deja de existir. Ocultar la ruta no reemplaza la seguridad:
 * el acceso sigue protegido por Supabase Auth y RLS.
 */
export function resolveAdminPath(raw: string | undefined): string {
  const value = (raw ?? '').trim().toLowerCase().replace(/\/+$/, '');
  if (!value) return '/admin';
  const path = value.startsWith('/') ? value : `/${value}`;
  // Un solo segmento seguro que no choque con las rutas públicas.
  if (!/^\/[a-z0-9][a-z0-9_-]{2,59}$/.test(path) || ['/reporte', '/ingresar'].includes(path)) {
    console.warn(`VITE_ADMIN_PATH inválido («${raw}»); se usa /admin.`);
    return '/admin';
  }
  return path;
}

export const ADMIN_PATH = resolveAdminPath(import.meta.env.VITE_ADMIN_PATH as string | undefined);
