import { CheckCircle2, Lock, LockOpen, Link2 } from 'lucide-react';
import type { Course } from '../../types/domain';
import type { CourseState } from '../../lib/engine/academic';
import { formatCredits } from '../../lib/pensumView';

interface Props {
  course: Course;
  state: CourseState | undefined;
  /** false en la vista pública cuando el progreso no está publicado. */
  showProgress: boolean;
  prerequisiteCount: number;
  onSelect: (course: Course) => void;
}

/**
 * Verde = aprobado, gris = pendiente (único significado del color).
 * Disponible/bloqueado se indica con ícono y etiqueta secundaria, sin cambiar el gris.
 */
export function CourseCard({ course, state, showProgress, prerequisiteCount, onSelect }: Props) {
  const approved = showProgress && state?.status === 'approved';
  const tone = !showProgress
    ? 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
    : approved
      ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/50'
      : 'border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-800/60';

  const statusLabel = approved ? 'Aprobado' : 'Pendiente';
  const availability = state?.availability;

  return (
    <button
      type="button"
      onClick={() => onSelect(course)}
      className={`print-avoid-break group w-full rounded-xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md ${tone}`}
      aria-label={`${course.code} ${course.name}, ${formatCredits(course.credits)} créditos${showProgress ? `, ${statusLabel}` : ''}${
        showProgress && availability === 'blocked' ? ', bloqueado' : showProgress && availability === 'available' ? ', disponible' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[11px] font-semibold tracking-wide text-slate-500 dark:text-slate-400">{course.code}</span>
        <span className="shrink-0 rounded-md bg-white/70 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200 dark:bg-slate-950/40 dark:text-slate-200 dark:ring-slate-700">
          {formatCredits(course.credits)} cr
        </span>
      </div>
      <p className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug text-slate-900 dark:text-slate-50">{course.name}</p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
        {showProgress && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
              approved
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-300/70 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
            }`}
          >
            {approved && <CheckCircle2 className="size-3" aria-hidden />}
            {statusLabel}
          </span>
        )}
        {showProgress && !approved && availability === 'available' && (
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
