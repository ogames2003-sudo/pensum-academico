import type { AccentColor } from '../types/domain';

/** Paletas de acento (identidad del programa). Ninguna es verde: el verde se reserva para «Aprobado». */
export const ACCENTS: Record<AccentColor, { label: string; shades: Record<50 | 100 | 500 | 600 | 700 | 900, string> }> = {
  azul: { label: 'Azul académico', shades: { 50: '#eff5ff', 100: '#dbe7fe', 500: '#3b6fd8', 600: '#2856b8', 700: '#1f4494', 900: '#142a5c' } },
  indigo: { label: 'Índigo', shades: { 50: '#eef0ff', 100: '#e0e3ff', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca', 900: '#312e81' } },
  vino: { label: 'Vino', shades: { 50: '#fdf2f4', 100: '#fbe4e8', 500: '#b5385a', 600: '#9b2448', 700: '#7f1d3b', 900: '#4c1023' } },
  pizarra: { label: 'Pizarra', shades: { 50: '#f1f5f9', 100: '#e2e8f0', 500: '#475569', 600: '#334155', 700: '#1e293b', 900: '#0f172a' } },
  ambar: { label: 'Ámbar', shades: { 50: '#fff8eb', 100: '#feeec7', 500: '#d97706', 600: '#b45309', 700: '#92400e', 900: '#5a2a0a' } },
};

export function applyAccent(accent: AccentColor) {
  const palette = ACCENTS[accent] ?? ACCENTS.azul;
  const root = document.documentElement.style;
  for (const [shade, value] of Object.entries(palette.shades)) root.setProperty(`--color-brand-${shade}`, value);
}

const THEME_KEY = 'pensum-theme';

export function getStoredTheme(): 'light' | 'dark' | null {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

export function setTheme(theme: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* almacenamiento bloqueado: el tema dura solo esta visita */
  }
}

export function initTheme() {
  const stored = getStoredTheme();
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', stored ? stored === 'dark' : prefersDark);
}
