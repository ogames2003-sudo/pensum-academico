import { Link } from 'react-router';
import { BookOpen, EyeOff, FileDown } from 'lucide-react';
import { usePensum } from '../context/PensumContext';
import { PensumBoard } from '../components/pensum/PensumBoard';
import { StatsPanel } from '../components/pensum/StatsPanel';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States';
import { ORGANIZATION_LABELS } from '../types/domain';

export function PublicPensumPage() {
  const { status, error, data, academic, courseById, reload } = usePensum();

  if (status === 'loading') return <LoadingState label="Cargando pensum…" />;
  if (status === 'error') return <ErrorState message={error ?? ''} onRetry={reload} />;
  if (status === 'empty' || !data || !academic) {
    return (
      <EmptyState icon={EyeOff} title="El pensum no está disponible">
        Todavía no se ha publicado un programa académico.
      </EmptyState>
    );
  }

  const labels = ORGANIZATION_LABELS[data.program.organizationType];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-brand-600 dark:text-brand-100">Pensum interactivo</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{data.program.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {data.courses.length} cursos · {data.terms.length} {labels.plural.toLowerCase()}
            {!data.progressVisible && ' · El progreso académico no es público'}
          </p>
        </div>
        {data.courses.length > 0 && (
          <Link to="/reporte" className="btn-secondary no-print">
            <FileDown className="size-4" /> Exportar PDF
          </Link>
        )}
      </div>

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
