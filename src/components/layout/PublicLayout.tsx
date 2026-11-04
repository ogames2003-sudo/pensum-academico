import { Link, Outlet } from 'react-router';
import { LogIn, LogOut } from 'lucide-react';
import { usePensum } from '../../context/PensumContext';
import { useAuth } from '../../context/AuthContext';
import { ThemeToggle } from './ThemeToggle';
import { ProgramLogo } from './ProgramLogo';

export function PublicLayout() {
  const { data } = usePensum();
  const { session, signOut } = useAuth();
  return (
    <div className="min-h-dvh">
      <header className="no-print sticky top-0 z-30 border-t-4 border-t-accent-600 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <ProgramLogo logoUrl={data?.program.logoUrl} name={data?.program.institution ?? data?.program.name} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold leading-tight">{data?.program.name ?? 'Pensum académico'}</span>
              {data?.program.institution && <span className="block truncate text-xs text-slate-500">{data.program.institution}</span>}
            </span>
          </Link>
          {/* Vista del estudiante: sin enlaces al panel; la administración se abre solo por su URL. */}
          <nav className="ml-auto flex shrink-0 items-center gap-1">
            <ThemeToggle />
            {session ? (
              <button type="button" className="btn-ghost px-3" onClick={() => signOut()} aria-label="Cerrar sesión">
                <LogOut className="size-4" /> <span className="hidden sm:inline">Salir</span>
              </button>
            ) : (
              <Link to="/ingresar" className="btn-primary px-3">
                <LogIn className="size-4" /> <span className="hidden sm:inline">Iniciar sesión</span>
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
