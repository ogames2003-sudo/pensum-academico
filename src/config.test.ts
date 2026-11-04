import { describe, expect, it } from 'vitest';
import { resolveAdminPath } from './config';

describe('resolveAdminPath', () => {
  it('usa /admin por defecto', () => {
    expect(resolveAdminPath(undefined)).toBe('/admin');
    expect(resolveAdminPath('  ')).toBe('/admin');
  });

  it('normaliza la ruta propia', () => {
    expect(resolveAdminPath('Gestion-X7k2')).toBe('/gestion-x7k2');
    expect(resolveAdminPath('/panel_umg/')).toBe('/panel_umg');
  });

  it('rechaza rutas inválidas o que chocan con las públicas', () => {
    for (const bad of ['/', '/a', '/con espacio', '/dos/segmentos', '/reporte', '/../x']) {
      expect(resolveAdminPath(bad)).toBe('/admin');
    }
  });
});
