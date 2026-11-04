import { Link } from 'react-router';
import { BookOpen, EyeOff, FileDown, LogIn, UserRound } from 'lucide-react';
import { usePensum } from '../context/PensumContext';
import { displayName, useAuth } from '../context/AuthContext';
import { PensumBoard } from '../components/pensum/PensumBoard';
import { StatsPanel } from '../components/pensum/StatsPanel';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States';
import { ORGANIZATION_LABELS } from '../types/domain';

export function PublicPensumPage() {
  const { status, error, data, academic, courseById, reload } = usePensum();
  const { session, isStudent, isAdmin, profile } = useAuth();

  if (status === 'loading') return <LoadingState label="Cargando pensum…" />;
  if (status === 'error') return <ErrorState message={error ?? ''} onRetry={reload} />;
  if (status === 'empty' || !data || !academic) {
    // Programa privado: solo los estudiantes con cuenta lo pueden ver.
    return session ? (
      <EmptyState icon={EyeOff} title="Tu cuenta aún no está habilitada">
        Pide al administrador que active tu cuenta ({session.user.email}) como estudiante.
      </EmptyState>
    ) : (
      <EmptyState
        icon={LogIn}
        title="Inicia sesión para ver tu pensum"
        action={
          <Link to="/ingresar" className="btn-primary">
            <LogIn className="size-4" /> Iniciar sesión
          </Link>
        }
      >
        Usa las credenciales que te entregaron para consultar tu progreso.
      </EmptyState>
    );
  }

  const labels = ORGANIZATION_LABELS[data.program.organizationType];
  const greeting = isStudent || isAdmin ? displayName(profile, session?.user.email) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {greeting ? (
            <p className="text-sm font-medium text-brand-600 dark:text-brand-100">Hola, {greeting}</p>
          ) : (
            <p className="text-sm font-medium text-brand-600 dark:text-brand-100">Pensum interactivo</p>
          )}
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{data.program.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {data.courses.length} cursos · {data.terms.length} {labels.plural.toLowerCase()}
          </p>
        </div>
        {data.courses.length > 0 && (
          <Link to="/reporte" className="btn-secondary no-print">
            <FileDown className="size-4" /> Exportar PDF
          </Link>
        )}
      </div>

      {session && !isStudent && !isAdmin && (
        <p className="card flex items-center gap-2 p-3 text-sm text-slate-600 dark:text-slate-300">
          <UserRound className="size-4 shrink-0" /> Tu cuenta aún no está habilitada como estudiante; por ahora ves el pensum sin progreso.
        </p>
      )}
      {!session && !data.progressVisible && (
        <p className="card flex flex-wrap items-center gap-2 p-3 text-sm text-slate-600 dark:text-slate-300">
          <UserRound className="size-4 shrink-0" /> ¿Eres estudiante?
          <Link to="/ingresar" className="font-medium text-brand-600 hover:underline dark:text-brand-100">
            Inicia sesión para ver tu progreso
          </Link>
        </p>
      )}

      {data.courses.length === 0 ? (
        <EmptyState icon={BookOpen} title="Aún no hay cursos registrados">
          El administrador todavía no ha cargado los cursos del programa.
        </EmptyState>
      ) : (
        <>
          <StatsPanel stats={academic.stats} showProgress={data.progressVisible} />
          <PensumBoard data={data} academic={academic} courseById={courseById} />
        </>
      )}
    </div>
  );
}
