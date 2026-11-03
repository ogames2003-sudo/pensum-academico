import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { setTheme } from '../../lib/theme';

export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  return (
    <button
      type="button"
      className="btn-ghost p-2"
      aria-label={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={dark ? 'Modo claro' : 'Modo oscuro'}
      onClick={() => {
        setTheme(dark ? 'light' : 'dark');
        setDark(!dark);
      }}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
