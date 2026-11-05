import { AlertTriangle, CheckCircle2, Clock, Hourglass, PencilLine } from 'lucide-react';
import { EVALUATION_LABELS, type EvaluationStatus } from '../../lib/engine/grades';

/**
 * Etiqueta del estado de evaluación. Solo «Aprobado» usa el verde de aprobación definitiva;
 * preaprobado y reprobado tienen su propio indicador para no confundirse con él.
 */
const STYLES: Record<EvaluationStatus, { cls: string; Icon: typeof CheckCircle2 }> = {
  approved: { cls: 'bg-emerald-600 text-white', Icon: CheckCircle2 },
  preapproved: { cls: 'bg-amber-100 text-amber-800 ring-1 ring-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:ring-amber-800', Icon: Clock },
  in_progress: { cls: 'bg-slate-200 text-slate-700 ring-1 ring-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:ring-slate-600', Icon: PencilLine },
  failed: { cls: 'bg-red-100 text-red-700 ring-1 ring-red-300 dark:bg-red-950/60 dark:text-red-200 dark:ring-red-800', Icon: AlertTriangle },
  pending: { cls: 'bg-slate-300/70 text-slate-700 dark:bg-slate-700 dark:text-slate-200', Icon: Hourglass },
};

/** Texto ampliado para los estados provisionales. */
export const EVALUATION_HINT: Partial<Record<EvaluationStatus, string>> = {
  preapproved: 'Preaprobado — examen final pendiente',
  in_progress: 'En curso — examen final pendiente',
};

export function EvaluationBadge({ status, long = false }: { status: EvaluationStatus; long?: boolean }) {
  const { cls, Icon } = STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      <Icon className="size-3 shrink-0" aria-hidden />
      {long ? (EVALUATION_HINT[status] ?? EVALUATION_LABELS[status]) : EVALUATION_LABELS[status]}
    </span>
  );
}
