import { useEffect, useRef, type ReactNode } from 'react';
import { Circle, Lock, LockOpen, X, AlertTriangle } from 'lucide-react';
import type { Course, Requirement, Term } from '../../types/domain';
import type { CourseState } from '../../lib/engine/academic';
import { describeMissing, describeRequirement } from '../../lib/engine/requirements';
import { formatCredits } from '../../lib/pensumView';
import { dependentsOf } from '../../lib/engine/graph';
import { formatScore, GRADE_FIELDS, totalScore, zoneScore, type Grades } from '../../lib/engine/grades';
import { EvaluationBadge } from './EvaluationBadge';

interface Props {
  course: Course | null;
  state: CourseState | undefined;
  term: Term | undefined;
  termLabel: string;
  requirements: Record<string, Requirement[]>;
  courseById: Map<string, Course>;
  progressVisible: boolean;
  /** Calificaciones del curso para el estudiante en pantalla. */
  grades: Grades | undefined;
  onClose: () => void;
  /** Acciones administrativas opcionales (aprobar / editar). */
  actions?: ReactNode;
}

/** Panel lateral (o inferior en móvil) con el detalle de un curso y exactamente lo que le falta. */
export function CourseDetail({ course, state, term, termLabel, requirements, courseById, progressVisible, grades, onClose, actions }: Props) {
  const closeBtn = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!course) return;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [course]);

  if (!course) return null;
  const reqs = requirements[course.id] ?? [];
  const unlocks = dependentsOf(requirements, course.id)
    .map((id) => courseById.get(id))
    .filter((c): c is Course => !!c);
  const approved = state?.status === 'approved';

  return (
    <div className="no-print fixed inset-0 z-40" role="dialog" aria-modal="true" aria-labelledby="course-detail-title">
      <div className="absolute inset-0 bg-slate-900/40 animate-fade-in" onClick={onClose} />
      <aside className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl dark:bg-slate-900 sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[440px] sm:rounded-none sm:animate-slide-in">
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
          <div>
            <p className="font-mono text-xs font-semibold text-slate-500">{course.code}</p>
            <h2 id="course-detail-title" className="mt-0.5 text-lg font-semibold leading-snug">
              {course.name}
            </h2>
          </div>
          <button ref={closeBtn} className="btn-ghost -mr-2 p-2" onClick={onClose} aria-label="Cerrar detalle">
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-6 px-5 py-5">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Info label="Créditos" value={formatCredits(course.credits)} />
            <Info label={termLabel} value={term?.name ?? 'Sin asignar'} />
            {term?.yearNumber != null && <Info label="Año" value={String(term.yearNumber)} />}
            {course.area && <Info label="Área" value={course.area} />}
          </dl>

          {progressVisible && state && (
            <section
              className={`rounded-xl border p-4 ${
                approved ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40' : 'border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-800/60'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <EvaluationBadge status={state.evaluation} long />
                {!approved && (
                  <span className="inline-flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300">
                    {state.availability === 'blocked' ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
                    {state.availability === 'blocked' ? 'Bloqueado' : 'Disponible para cursar'}
                  </span>
                )}
              </div>
              {state.evaluation === 'preapproved' && (
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                  Estado provisional: la zona alcanza 61 puntos, pero el curso no se aprueba ni suma créditos hasta registrar el examen final.
                </p>
              )}
              <GradeBreakdown grades={grades} manualApproved={approved && !state.graded} />
              {!approved && state.missing.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-medium">Requisitos que faltan:</p>
                  <ul className="mt-1.5 space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
                    {state.missing.map((m, i) => (
                      <li key={i} className="flex gap-2">
                        <Circle className="mt-1 size-2.5 shrink-0 fill-current text-slate-400" aria-hidden />
                        {describeMissing(m, courseById)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {approved && state.approvedWithUnmetRequirements && (
                <p className="mt-2 flex gap-2 text-sm text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Aprobado sin cumplir todos sus prerrequisitos.
                </p>
              )}
            </section>
          )}

          <section>
            <h3 className="text-sm font-semibold">Prerrequisitos</h3>
            {reqs.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">Ninguno.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {reqs.map((r, i) => (
                  <li key={i} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                    {describeRequirement(r, courseById)}
                    {r.type === 'courses' && r.courseIds.length > 1 && (
                      <ul className="mt-1 text-xs text-slate-500">
                        {r.courseIds.map((id) => (
                          <li key={id}>
                            {courseById.get(id)?.code} · {courseById.get(id)?.name}
                          </li>
                        ))}
                      </ul>
                    )}
                    {r.type === 'courses' && r.courseIds.length === 1 && (
                      <span className="text-slate-500"> · {courseById.get(r.courseIds[0]!)?.name}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {unlocks.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold">Es prerrequisito de</h3>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {unlocks.map((c) => (
                  <li key={c.id} className="rounded-md bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">
                    <span className="font-mono font-semibold">{c.code}</span> {c.name}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {course.description && (
            <section>
              <h3 className="text-sm font-semibold">Descripción</h3>
              <p className="mt-1 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">{course.description}</p>
            </section>
          )}

          {actions && <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">{actions}</div>}
        </div>
      </aside>
    </div>
  );
}

/** Desglose completo: actividad, nota y máximo; zona y total. «--» = no registrada. */
function GradeBreakdown({ grades, manualApproved }: { grades: Grades | undefined; manualApproved: boolean }) {
  if (manualApproved) {
    return <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">Aprobado sin calificaciones registradas.</p>;
  }
  const zone = grades ? zoneScore(grades) : null;
  const total = grades ? totalScore(grades) : null;
  return (
    <table className="mt-3 w-full text-sm">
      <caption className="sr-only">Calificaciones del curso</caption>
      <tbody className="divide-y divide-slate-200/70 dark:divide-slate-700/70">
        {GRADE_FIELDS.map((f) => (
          <tr key={f.key}>
            <th scope="row" className="py-1.5 text-left font-normal text-slate-600 dark:text-slate-300">
              <span className="mr-1.5 inline-block w-6 font-mono text-xs font-semibold text-slate-500">{f.code}</span>
              {f.label}
            </th>
            <td className="py-1.5 text-right font-mono tabular-nums">
              <strong>{formatScore(grades ? grades[f.key] : null)}</strong>
              <span className="text-slate-400">/{f.max}</span>
            </td>
          </tr>
        ))}
        <tr>
          <th scope="row" className="pt-2 text-left font-semibold">Zona</th>
          <td className="pt-2 text-right font-mono font-semibold tabular-nums">{zone === null ? '--' : `${formatScore(zone)}/70`}</td>
        </tr>
        <tr>
          <th scope="row" className="py-1 text-left font-semibold">Nota total</th>
          <td className="py-1 text-right font-mono font-semibold tabular-nums">
            {total !== null ? `${formatScore(total)}/100` : zone !== null ? 'Pendiente' : '--'}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
