import { useMemo, useState, type ReactNode } from 'react';
import { Lock, LockOpen, SearchX } from 'lucide-react';
import type { Course, PensumData } from '../../types/domain';
import { ORGANIZATION_LABELS } from '../../types/domain';
import type { AcademicState } from '../../lib/engine/academic';
import { areasOf, EMPTY_FILTERS, filterCourses, formatCredits, groupByTerm, type PensumFilters } from '../../lib/pensumView';
import { CourseCard } from './CourseCard';
import { CourseDetail } from './CourseDetail';
import { FiltersBar } from './FiltersBar';

interface Props {
  data: PensumData;
  academic: AcademicState;
  courseById: Map<string, Course>;
  /** Acciones administrativas para el panel de detalle. */
  detailActions?: (course: Course, close: () => void) => ReactNode;
}

/** Cuadrícula por ciclos en escritorio; lista vertical en móvil. Filtros y buscador integrados. */
export function PensumBoard({ data, academic, courseById, detailActions }: Props) {
  const [filters, setFilters] = useState<PensumFilters>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const labels = ORGANIZATION_LABELS[data.program.organizationType];
  const showProgress = data.progressVisible;

  const filtered = useMemo(() => filterCourses(data.courses, academic, filters), [data.courses, academic, filters]);
  const visibleSections = useMemo(
    () => groupByTerm(data.terms, filtered).filter((s) => s.courses.length > 0),
    [data.terms, filtered],
  );
  const selected = selectedId ? (courseById.get(selectedId) ?? null) : null;
  const close = () => setSelectedId(null);

  return (
    <div className="space-y-4">
      <FiltersBar
        filters={filters}
        onChange={setFilters}
        terms={data.terms}
        areas={areasOf(data.courses)}
        termLabel={labels.singular}
        showProgress={showProgress}
        resultCount={filtered.length}
      />

      {showProgress && (
        <div className="no-print flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400" aria-label="Leyenda">
          <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded border border-emerald-400 bg-emerald-50" /> Aprobado</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded border border-slate-300 bg-slate-100" /> Pendiente</span>
          <span className="inline-flex items-center gap-1"><LockOpen className="size-3" /> Disponible</span>
          <span className="inline-flex items-center gap-1"><Lock className="size-3" /> Bloqueado (requisitos sin cumplir)</span>
        </div>
      )}

      {visibleSections.length === 0 ? (
        <div className="card flex flex-col items-center py-12 text-center text-sm text-slate-500">
          <SearchX className="mb-2 size-8 text-slate-400" />
          Ningún curso coincide con los filtros.
        </div>
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:overflow-x-auto lg:pb-3">
          {visibleSections.map((s) => {
            const credits = s.courses.reduce((n, c) => n + c.credits, 0);
            const approved = s.courses.filter((c) => academic.byCourse.get(c.id)?.status === 'approved').length;
            return (
              <section key={s.term?.id ?? 'none'} className="print-avoid-break lg:w-60 lg:shrink-0 xl:w-64" aria-label={s.term?.name ?? 'Sin asignar'}>
                <header className="mb-2 flex items-baseline justify-between gap-2 px-1">
                  <div>
                    {s.term?.yearNumber != null && (
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-accent-600 dark:text-accent-100">Año {s.term.yearNumber}</p>
                    )}
                    <h3 className="font-semibold">{s.term?.name ?? `Sin ${labels.singular.toLowerCase()} asignado`}</h3>
                  </div>
                  <p className="shrink-0 text-xs text-slate-500">
                    {formatCredits(credits)} cr{showProgress && ` · ${approved}/${s.courses.length}`}
                  </p>
                </header>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  {s.courses.map((c) => (
                    <CourseCard
                      key={c.id}
                      course={c}
                      state={academic.byCourse.get(c.id)}
                      showProgress={showProgress}
                      prerequisiteCount={(data.requirements[c.id] ?? []).length}
                      onSelect={(course) => setSelectedId(course.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <CourseDetail
        course={selected}
        state={selected ? academic.byCourse.get(selected.id) : undefined}
        term={selected?.termId ? data.terms.find((t) => t.id === selected.termId) : undefined}
        termLabel={labels.singular}
        requirements={data.requirements}
        courseById={courseById}
        progressVisible={showProgress}
        onClose={close}
        actions={selected && detailActions ? detailActions(selected, close) : undefined}
      />
    </div>
  );
}
