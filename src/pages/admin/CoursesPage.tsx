import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ArrowDown, ArrowUp, BookOpen, CheckCircle2, Circle, Loader2, Lock, LockOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Course } from '../../types/domain';
import { ORGANIZATION_LABELS } from '../../types/domain';
import { usePensum } from '../../context/PensumContext';
import { useApprovalToggle } from '../../hooks/useApprovalToggle';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { CourseForm } from '../../components/admin/CourseForm';
import { FiltersBar } from '../../components/pensum/FiltersBar';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { areasOf, EMPTY_FILTERS, filterCourses, formatCredits, groupByTerm, hasActiveFilters, type PensumFilters } from '../../lib/pensumView';
import { describeRequirement } from '../../lib/engine/requirements';
import { dependentsOf } from '../../lib/engine/graph';
import { deleteCourse, reorder } from '../../services/pensumService';
import { friendlyError } from '../../services/supabase';

export function CoursesPage() {
  const { status, error, data, academic, courseById, reload } = usePensum();
  const { toggle, savingId } = useApprovalToggle();
  const confirm = useConfirm();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState<PensumFilters>(EMPTY_FILTERS);
  const [busy, setBusy] = useState(false);

  const editingId = params.get('editar');
  const creating = params.get('nuevo') === '1';
  const defaultTermId = params.get('ciclo') ?? undefined;
  const closeForm = () => setParams({}, { replace: true });

  const filtered = useMemo(
    () => (data && academic ? filterCourses(data.courses, academic, filters) : []),
    [data, academic, filters],
  );

  if (status === 'loading') return <LoadingState />;
  if (status === 'error') return <ErrorState message={error ?? ''} onRetry={reload} />;
  if (!data || !academic) return null;

  const labels = ORGANIZATION_LABELS[data.program.organizationType];
  const sections = groupByTerm(data.terms, filtered).filter((s) => s.courses.length);
  const editing = editingId ? (courseById.get(editingId) ?? null) : null;
  const reorderDisabled = hasActiveFilters(filters) || busy;

  async function remove(course: Course) {
    const dependents = dependentsOf(data!.requirements, course.id).map((id) => courseById.get(id)?.code).filter(Boolean);
    const ok = await confirm({
      title: `Eliminar ${course.code}`,
      tone: 'danger',
      confirmLabel: 'Eliminar curso',
      message: (
        <>
          <p>Se eliminará <strong>{course.name}</strong>, sus requisitos y su registro de aprobación. Esta acción no se puede deshacer.</p>
          {dependents.length > 0 && (
            <p className="mt-2">Es prerrequisito de <strong>{dependents.join(', ')}</strong>: se quitará de sus requisitos.</p>
          )}
        </>
      ),
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteCourse(course.id);
      await reload();
      toast.success(`${course.code} eliminado.`);
    } catch (e) {
      toast.error(`No se eliminó: ${friendlyError(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function move(list: Course[], index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    const ids = list.map((c) => c.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    setBusy(true);
    try {
      await reorder('courses', ids);
      await reload();
    } catch (e) {
      toast.error(`No se guardó el nuevo orden: ${friendlyError(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cursos</h1>
          <p className="text-sm text-slate-500">{data.courses.length} cursos · {formatCredits(academic.stats.totalCredits)} créditos en total</p>
        </div>
        <button className="btn-primary" onClick={() => setParams({ nuevo: '1' })}>
          <Plus className="size-4" /> Nuevo curso
        </button>
      </div>

      {data.courses.length === 0 ? (
        <EmptyState icon={BookOpen} title="No hay cursos" action={<button className="btn-primary" onClick={() => setParams({ nuevo: '1' })}><Plus className="size-4" /> Crear curso</button>}>
          Crea los cursos del programa o impórtalos desde la sección Datos.
        </EmptyState>
      ) : (
        <>
          <FiltersBar filters={filters} onChange={setFilters} terms={data.terms} areas={areasOf(data.courses)} termLabel={labels.singular} showProgress resultCount={filtered.length} />
          {reorderDisabled && hasActiveFilters(filters) && <p className="text-xs text-slate-500">Limpia los filtros para reordenar cursos.</p>}

          {sections.map((s) => (
            <section key={s.term?.id ?? 'none'} className="card overflow-hidden">
              <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/40">
                <h2 className="text-sm font-semibold">
                  {s.term?.name ?? 'Sin asignar'} <span className="font-normal text-slate-500">· {s.courses.length} cursos</span>
                </h2>
                <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setParams({ nuevo: '1', ...(s.term ? { ciclo: s.term.id } : {}) })}>
                  <Plus className="size-3.5" /> Agregar aquí
                </button>
              </header>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {s.courses.map((c, i) => {
                  const st = academic.byCourse.get(c.id)!;
                  const approved = st.status === 'approved';
                  const reqs = data.requirements[c.id] ?? [];
                  return (
                    <li key={c.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">
                          <span className="font-mono text-xs font-semibold text-slate-500">{c.code}</span>{' '}
                          <span className="font-medium">{c.name}</span>
                          {c.isDemo && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">DEMO</span>}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                          <span>{formatCredits(c.credits)} créditos</span>
                          {c.area && <span>{c.area}</span>}
                          {!approved && (st.availability === 'available' ? <span className="inline-flex items-center gap-1"><LockOpen className="size-3" />Disponible</span> : <span className="inline-flex items-center gap-1"><Lock className="size-3" />Bloqueado</span>)}
                          {reqs.length > 0 && <span className="truncate">Req.: {reqs.map((r) => describeRequirement(r, courseById)).join(' · ')}</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 self-end sm:self-auto">
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
                        <button className="btn-ghost p-1.5" disabled={reorderDisabled || i === 0} onClick={() => move(s.courses, i, -1)} aria-label={`Subir ${c.code}`}>
                          <ArrowUp className="size-4" />
                        </button>
                        <button className="btn-ghost p-1.5" disabled={reorderDisabled || i === s.courses.length - 1} onClick={() => move(s.courses, i, 1)} aria-label={`Bajar ${c.code}`}>
                          <ArrowDown className="size-4" />
                        </button>
                        <button className="btn-ghost p-1.5" onClick={() => setParams({ editar: c.id })} aria-label={`Editar ${c.code}`}>
                          <Pencil className="size-4" />
                        </button>
                        <button className="btn-ghost p-1.5 text-red-600" disabled={busy} onClick={() => remove(c)} aria-label={`Eliminar ${c.code}`}>
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {sections.length === 0 && <p className="card p-8 text-center text-sm text-slate-500">Ningún curso coincide con los filtros.</p>}
        </>
      )}

      {(creating || editing) && (
        <CourseForm
          key={editing?.id ?? 'new'}
          open
          course={editing}
          data={data}
          defaultTermId={defaultTermId}
          onClose={closeForm}
          onSaved={reload}
        />
      )}
    </div>
  );
}
