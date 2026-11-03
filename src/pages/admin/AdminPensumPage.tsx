import { Link } from 'react-router';
import { BookOpen, CheckCircle2, Circle, Loader2, Pencil } from 'lucide-react';
import { usePensum } from '../../context/PensumContext';
import { useApprovalToggle } from '../../hooks/useApprovalToggle';
import { PensumBoard } from '../../components/pensum/PensumBoard';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';

/** El mismo pensum interactivo de la vista pública, con acciones de aprobación y edición. */
export function AdminPensumPage() {
  const { status, error, data, academic, courseById, reload } = usePensum();
  const { toggle, savingId } = useApprovalToggle();

  if (status === 'loading') return <LoadingState />;
  if (status === 'error') return <ErrorState message={error ?? ''} onRetry={reload} />;
  if (!data || !academic) return null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pensum</h1>
        <p className="text-sm text-slate-500">Selecciona un curso para ver su detalle y cambiar su aprobación.</p>
      </div>
      {data.courses.length === 0 ? (
        <EmptyState icon={BookOpen} title="No hay cursos" action={<Link className="btn-primary" to="/admin/cursos?nuevo=1">Crear curso</Link>} />
      ) : (
        <PensumBoard
          data={data}
          academic={academic}
          courseById={courseById}
          detailActions={(course) => {
            const approved = academic.byCourse.get(course.id)?.status === 'approved';
            return (
              <>
                <button className={approved ? 'btn-secondary' : 'btn bg-emerald-600 text-white hover:bg-emerald-700'} onClick={() => toggle(course)} disabled={savingId !== null}>
                  {savingId === course.id ? <Loader2 className="size-4 animate-spin" /> : approved ? <Circle className="size-4" /> : <CheckCircle2 className="size-4" />}
                  {approved ? 'Marcar como pendiente' : 'Marcar como aprobado'}
                </button>
                <Link className="btn-ghost" to={`/admin/cursos?editar=${course.id}`}>
                  <Pencil className="size-4" /> Editar curso
                </Link>
              </>
            );
          }}
        />
      )}
    </div>
  );
}
