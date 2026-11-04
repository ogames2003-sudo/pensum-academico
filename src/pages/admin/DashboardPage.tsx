import { Link } from 'react-router';
import { BookOpen, CheckCircle2, Circle, FileDown, Loader2, Lock, LockOpen, Pencil, Plus } from 'lucide-react';
import { usePensum } from '../../context/PensumContext';
import { StatsPanel } from '../../components/pensum/StatsPanel';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { useApprovalToggle } from '../../hooks/useApprovalToggle';
import { formatCredits, groupByTerm } from '../../lib/pensumView';
import { ORGANIZATION_LABELS } from '../../types/domain';
import { ADMIN_PATH } from '../../config';

export function DashboardPage() {
  const { status, error, data, academic, reload } = usePensum();
  const { toggle, savingId } = useApprovalToggle();

  if (status === 'loading') return <LoadingState />;
  if (status === 'error') return <ErrorState message={error ?? ''} onRetry={reload} />;
  if (!data || !academic) return null;

  const labels = ORGANIZATION_LABELS[data.program.organizationType];
  const sections = groupByTerm(data.terms, data.courses);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Resumen académico</h1>
          <p className="text-sm text-slate-500">
            {data.program.isPublic ? (data.program.showProgressPublic ? 'Pensum y progreso públicos' : 'Pensum público · progreso privado') : 'Pensum privado'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/reporte" className="btn-secondary"><FileDown className="size-4" /> PDF</Link>
          <Link to={`${ADMIN_PATH}/cursos?nuevo=1`} className="btn-primary"><Plus className="size-4" /> Nuevo curso</Link>
        </div>
      </div>

      {data.courses.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Tu pensum está vacío"
          action={
            <>
              <Link to={`${ADMIN_PATH}/cursos?nuevo=1`} className="btn-primary"><Plus className="size-4" /> Crear el primer curso</Link>
              <Link to={`${ADMIN_PATH}/datos`} className="btn-secondary">Importar CSV o cargar demo</Link>
            </>
          }
        >
          Agrega los cursos uno por uno, impórtalos desde un CSV o carga datos de demostración para explorar la aplicación.
        </EmptyState>
      ) : (
        <>
          <StatsPanel stats={academic.stats} showProgress detailed />

          <div className="card p-5">
            <h2 className="font-semibold">Créditos por {labels.singular.toLowerCase()}</h2>
            <p className="text-xs text-slate-500">Verde: obtenidos · gris: pendientes</p>
            <ul className="mt-4 space-y-3">
              {sections.filter((s) => s.courses.length).map((s) => {
                const total = s.courses.reduce((n, c) => n + c.credits, 0);
                const earned = s.courses.reduce((n, c) => (academic.byCourse.get(c.id)?.status === 'approved' ? n + c.credits : n), 0);
                const max = Math.max(...sections.map((x) => x.courses.reduce((n, c) => n + c.credits, 0)), 1);
                return (
                  <li key={s.term?.id ?? 'none'} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[10rem_1fr_auto]">
                    <span className="truncate text-slate-600 dark:text-slate-300">{s.term?.name ?? 'Sin asignar'}</span>
                    <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-800" style={{ width: `${Math.max((total / max) * 100, 4)}%` }}>
                      <div className="flex h-full overflow-hidden rounded-full">
                        <div className="bg-emerald-500" style={{ width: total ? `${(earned / total) * 100}%` : 0 }} />
                        <div className="flex-1 bg-slate-300 dark:bg-slate-600" />
                      </div>
                    </div>
                    <span className="tabular-nums text-xs text-slate-500">{formatCredits(earned)}/{formatCredits(total)}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="font-semibold">Acciones rápidas</h2>
              <Link to={`${ADMIN_PATH}/cursos`} className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-100">Gestionar cursos</Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/50">
                  <tr>
                    <th className="px-5 py-2.5 font-semibold">Curso</th>
                    <th className="px-3 py-2.5 font-semibold">{labels.singular}</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Créditos</th>
                    <th className="px-3 py-2.5 font-semibold">Disponibilidad</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Aprobación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sections.flatMap((s) =>
                    s.courses.map((c) => {
                      const st = academic.byCourse.get(c.id)!;
                      const approved = st.status === 'approved';
                      return (
                        <tr key={c.id} className={approved ? 'bg-emerald-50/60 dark:bg-emerald-950/20' : ''}>
                          <td className="px-5 py-2.5">
                            <span className="font-mono text-xs text-slate-500">{c.code}</span>
                            <span className="ml-2 font-medium">{c.name}</span>
                          </td>
                          <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{s.term?.name ?? '—'}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{formatCredits(c.credits)}</td>
                          <td className="px-3 py-2.5 text-xs text-slate-500">
                            {approved ? '—' : st.availability === 'available' ? <span className="inline-flex items-center gap-1"><LockOpen className="size-3" /> Disponible</span> : <span className="inline-flex items-center gap-1"><Lock className="size-3" /> Bloqueado</span>}
                          </td>
                          <td className="px-5 py-2.5">
                            <div className="flex justify-end gap-1">
                              <button
                                className={`btn px-2.5 py-1 text-xs ${approved ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'border border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'}`}
                                onClick={() => toggle(c)}
                                disabled={savingId !== null}
                                aria-pressed={approved}
                                aria-label={`${approved ? 'Marcar como pendiente' : 'Marcar como aprobado'}: ${c.code}`}
                              >
                                {savingId === c.id ? <Loader2 className="size-3.5 animate-spin" /> : approved ? <CheckCircle2 className="size-3.5" /> : <Circle className="size-3.5" />}
                                {approved ? 'Aprobado' : 'Pendiente'}
                              </button>
                              <Link to={`${ADMIN_PATH}/cursos?editar=${c.id}`} className="btn-ghost p-1.5" aria-label={`Editar ${c.code}`}>
                                <Pencil className="size-4" />
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    }),
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
