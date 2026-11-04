import { Navigate, NavLink, Outlet, useLocation } from 'react-router';
import { BookOpen, Database, Eye, LayoutDashboard, LogOut, Settings, ShieldAlert, Table2, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePensum } from '../../context/PensumContext';
import { EmptyState, LoadingState } from '../ui/States';
import { ThemeToggle } from './ThemeToggle';
import { ProgramLogo } from './ProgramLogo';
import { ADMIN_PATH } from '../../config';
import { StudentSwitcher } from '../admin/StudentSwitcher';

const NAV = [
  { to: ADMIN_PATH, label: 'Resumen', icon: LayoutDashboard, end: true },
  { to: `${ADMIN_PATH}/pensum`, label: 'Pensum', icon: Table2 },
  { to: `${ADMIN_PATH}/cursos`, label: 'Cursos', icon: BookOpen },
  { to: `${ADMIN_PATH}/estudiantes`, label: 'Estudiantes', icon: Users },
  { to: `${ADMIN_PATH}/programa`, label: 'Programa', icon: Settings },
  { to: `${ADMIN_PATH}/datos`, label: 'Datos', icon: Database },
];

/** Protege el panel (ADMIN_PATH): requiere sesión de Supabase Auth y rol 'admin' en profiles (verificado también por RLS). */
export function AdminLayout() {
  const { loading, session, isAdmin, signOut } = useAuth();
  const { data, status } = usePensum();
  const location = useLocation();

  if (loading) return <LoadingState label="Verificando sesión…" />;
  if (!session) return <Navigate to={`${ADMIN_PATH}/login`} replace state={{ from: location.pathname }} />;
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <EmptyState
          icon={ShieldAlert}
          title="Acceso restringido"
          action={
            <button className="btn-secondary" onClick={() => signOut()}>
              <LogOut className="size-4" /> Cerrar sesión
            </button>
          }
        >
          La cuenta {session.user.email} no tiene permisos de administración.
        </EmptyState>
      </div>
    );
  }

  // Sin programa: la única sección útil es crearlo.
  const needsProgram = status === 'empty' && location.pathname !== `${ADMIN_PATH}/programa`;
  if (needsProgram) return <Navigate to={`${ADMIN_PATH}/programa`} replace />;

  return (
    <div className="min-h-dvh lg:flex">
      <aside className="no-print sticky top-0 z-30 border-t-4 border-t-accent-600 border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 lg:h-dvh lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2.5 px-4 py-3 lg:py-5">
          <ProgramLogo logoUrl={data?.program.logoUrl} name={data?.program.institution ?? data?.program.name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{data?.program.name ?? 'Nuevo programa'}</p>
            <p className="text-xs text-slate-500">Administración</p>
          </div>
          <div className="lg:hidden">
            <ThemeToggle />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:px-3" aria-label="Administración">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-100'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`
              }
            >
              <Icon className="size-4" /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden border-t border-slate-200 p-3 dark:border-slate-800 lg:absolute lg:inset-x-0 lg:bottom-0 lg:block">
          <NavLink to="/" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
            <Eye className="size-4" /> Ver vista pública
          </NavLink>
          <div className="mt-1 flex items-center justify-between">
            <button className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" onClick={() => signOut()}>
              <LogOut className="size-4" /> Salir
            </button>
            <ThemeToggle />
          </div>
          <p className="truncate px-3 text-[11px] text-slate-400">{session.user.email}</p>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        {/* El progreso que se ve y edita depende del estudiante elegido. */}
        {[ADMIN_PATH, `${ADMIN_PATH}/pensum`, `${ADMIN_PATH}/cursos`].includes(location.pathname.replace(/\/$/, '')) && <StudentSwitcher />}
        <Outlet />
        <div className="no-print mt-10 flex justify-center gap-4 text-sm lg:hidden">
          <NavLink to="/" className="text-slate-500 hover:underline">Vista pública</NavLink>
          <button className="text-slate-500 hover:underline" onClick={() => signOut()}>Cerrar sesión</button>
        </div>
      </main>
    </div>
  );
}
