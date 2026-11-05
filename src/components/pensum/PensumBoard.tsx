import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, Lock, LockOpen, SearchX } from 'lucide-react';
import type { Course, PensumData } from '../../types/domain';
import { ORGANIZATION_LABELS } from '../../types/domain';
import type { AcademicState } from '../../lib/engine/academic';
import {
  areasOf,
  EMPTY_FILTERS,
  filterCourses,
  formatCredits,
  groupByTerm,
  hasActiveFilters,
  type PensumFilters,
  type TermSection,
} from '../../lib/pensumView';

const sectionKey = (s: TermSection) => s.term?.id ?? 'sin-ciclo';
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

/** Ciclos plegables (flecha para mostrar/ocultar sus cursos), con filtros y buscador integrados. */
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

  // Ciclos plegables: todos empiezan cerrados. Con búsqueda o filtros activos se abren los que tienen resultados.
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const filtering = hasActiveFilters(filters);
  const toggleSection = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

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
        <div className="space-y-3">
          <div className="no-print flex justify-end gap-1 text-xs">
            <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setOpen(new Set(visibleSections.map(sectionKey)))}>
              <ChevronsUpDown className="size-3.5" /> Mostrar todos
            </button>
            <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setOpen(new Set())}>
              <ChevronsDownUp className="size-3.5" /> Ocultar todos
            </button>
          </div>
          {visibleSections.map((s) => {
            const key = sectionKey(s);
            const isOpen = filtering || open.has(key);
            const credits = s.courses.reduce((n, c) => n + c.credits, 0);
            const approved = s.courses.filter((c) => academic.byCourse.get(c.id)?.status === 'approved').length;
            const approvedCredits = s.courses.reduce((n, c) => (academic.byCourse.get(c.id)?.status === 'approved' ? n + c.credits : n), 0);
            const panelId = `ciclo-${key}`;
            return (
              <section key={key} className="card overflow-hidden" aria-label={s.term?.name ?? 'Sin asignar'}>
                <h3>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => toggleSection(key)}
                    disabled={filtering}
                  >
                    <ChevronDown className={`size-5 shrink-0 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      {s.term?.yearNumber != null && (
                        <span className="block text-[11px] font-semibold uppercase tracking-wider text-accent-600 dark:text-accent-100">Año {s.term.yearNumber}</span>
                      )}
                      <span className="block font-semibold">{s.term?.name ?? `Sin ${labels.singular.toLowerCase()} asignado`}</span>
                      {showProgress && (
                        <span className="mt-1.5 block h-1.5 max-w-48 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden>
                          <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${s.courses.length ? (approved / s.courses.length) * 100 : 0}%` }} />
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-right text-xs text-slate-500">
                      {showProgress ? (
                        <>
                          <span className={`block font-semibold ${approved === s.courses.length ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-200'}`}>
                            {approved}/{s.courses.length} aprobados
                          </span>
                          {formatCredits(approvedCredits)} de {formatCredits(credits)} cr
                        </>
                      ) : (
                        <>
                          <span className="block font-semibold text-slate-700 dark:text-slate-200">{s.courses.length} cursos</span>
                          {formatCredits(credits)} cr
                        </>
                      )}
                    </span>
                  </button>
                </h3>
                <div id={panelId} hidden={!isOpen} className="grid gap-2 border-t border-slate-100 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 dark:border-slate-800">
                  {s.courses.map((c) => (
                    <CourseCard
                      key={c.id}
                      course={c}
                      state={academic.byCourse.get(c.id)}
                      grades={data.grades[c.id]}
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
        grades={selected ? data.grades[selected.id] : undefined}
        onClose={close}
        actions={selected && detailActions ? detailActions(selected, close) : undefined}
      />
    </div>
  );
}
