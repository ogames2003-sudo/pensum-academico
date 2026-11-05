import { Lock, LockOpen, Link2 } from 'lucide-react';
import type { Course } from '../../types/domain';
import type { CourseState } from '../../lib/engine/academic';
import { EVALUATION_LABELS, formatScore, GRADE_FIELDS, totalScore, zoneScore, type Grades } from '../../lib/engine/grades';
import { formatCredits } from '../../lib/pensumView';
import { EvaluationBadge } from './EvaluationBadge';

interface Props {
  course: Course;
  state: CourseState | undefined;
  /** Calificaciones del curso (undefined = ninguna registrada → se muestra «--»). */
  grades: Grades | undefined;
  /** false en la vista pública cuando el progreso no está publicado. */
  showProgress: boolean;
  prerequisiteCount: number;
  onSelect: (course: Course) => void;
}

/**
 * Verde = aprobado definitivo; gris = todo lo demás (pendiente, en curso, preaprobado, reprobado).
 * Preaprobado y reprobado se distinguen con su etiqueta, no con el color de la tarjeta.
 * Disponible/bloqueado (prerrequisitos) se indica aparte, con ícono.
 */
export function CourseCard({ course, state, grades, showProgress, prerequisiteCount, onSelect }: Props) {
  const evaluation = state?.evaluation ?? 'pending';
  const approved = showProgress && state?.status === 'approved';
  const tone = !showProgress
    ? 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
    : approved
      ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/50'
      : 'border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-800/60';
  const availability = state?.availability;
  // Sin notas pero aprobado manualmente (datos anteriores a las calificaciones): no se inventan valores.
  const showGrades = showProgress && (state?.graded || evaluation !== 'approved');
  const g = grades;
  const zone = g ? zoneScore(g) : null;
  const total = g ? totalScore(g) : null;

  return (
    <button
      type="button"
      onClick={() => onSelect(course)}
      className={`print-avoid-break group flex w-full flex-col rounded-xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md ${tone}`}
      aria-label={`${course.code} ${course.name}, ${formatCredits(course.credits)} créditos${showProgress ? `, ${EVALUATION_LABELS[evaluation]}` : ''}${
        showProgress && total !== null ? `, total ${formatScore(total)} de 100` : ''
      }${showProgress && !approved && availability === 'blocked' ? ', bloqueado' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[11px] font-semibold tracking-wide text-slate-500 dark:text-slate-400">{course.code}</span>
        <span className="shrink-0 rounded-md bg-white/70 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200 dark:bg-slate-950/40 dark:text-slate-200 dark:ring-slate-700">
          {formatCredits(course.credits)} cr
        </span>
      </div>
      <p className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug text-slate-900 dark:text-slate-50">{course.name}</p>

      {showGrades && (
        <div className="mt-2 space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
          {/* Cuadrícula de 5 columnas: no desborda en pantallas angostas. */}
          <dl className="grid grid-cols-5 gap-1 text-center">
            {GRADE_FIELDS.map((f) => (
              <div key={f.key} className="rounded-md bg-white/60 px-0.5 py-0.5 dark:bg-slate-950/30">
                <dt className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">{f.code}</dt>
                <dd className="font-mono tabular-nums text-slate-800 dark:text-slate-100">{formatScore(g ? g[f.key] : null)}</dd>
              </div>
            ))}
          </dl>
          <p className="flex flex-wrap justify-between gap-x-2 tabular-nums">
            <span>
              Zona: <strong className="text-slate-800 dark:text-slate-100">{zone === null ? '--' : `${formatScore(zone)}/70`}</strong>
            </span>
            <span>
              Total:{' '}
              <strong className="text-slate-800 dark:text-slate-100">
                {total !== null ? `${formatScore(total)}/100` : zone !== null ? 'Pendiente' : '--'}
              </strong>
            </span>
          </p>
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3 text-[11px] font-medium">
        {showProgress && <EvaluationBadge status={evaluation} />}
        {showProgress && !approved && availability === 'available' && evaluation === 'pending' && (
          <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
            <LockOpen className="size-3" aria-hidden /> Disponible
          </span>
        )}
        {showProgress && !approved && availability === 'blocked' && (
          <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
            <Lock className="size-3" aria-hidden /> Bloqueado
          </span>
        )}
        {prerequisiteCount > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 text-slate-500 dark:text-slate-400" title="Tiene prerrequisitos">
            <Link2 className="size-3" aria-hidden /> {prerequisiteCount}
          </span>
        )}
      </div>
    </button>
  );
}
