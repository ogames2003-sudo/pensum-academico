import type { ComponentType } from 'react';
import { BookCheck, BookOpen, GraduationCap, Hourglass, Lock, LockOpen, Sigma, Target } from 'lucide-react';
import type { AcademicStats } from '../../lib/engine/academic';
import { formatCredits } from '../../lib/pensumView';
import { ProgressBar } from '../ui/States';

export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  accent = false,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="card print-avoid-break p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
        <Icon className={`size-4 ${accent ? 'text-emerald-600' : 'text-brand-600 dark:text-brand-100'}`} /> {label}
      </div>
      <p className="mt-1.5 text-2xl font-bold tabular-nums tracking-tight">{value}</p>
      {hint && <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
}

/** Resumen de avance. Todos los números vienen del motor (computeAcademicState). */
export function StatsPanel({ stats, showProgress, detailed = false }: { stats: AcademicStats; showProgress: boolean; detailed?: boolean }) {
  if (!showProgress) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <StatTile icon={BookOpen} label="Cursos del programa" value={String(stats.totalCourses)} />
        <StatTile icon={Sigma} label="Créditos del programa" value={formatCredits(stats.totalCredits)} />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Avance en créditos</p>
            <p className="text-3xl font-bold tabular-nums tracking-tight">
              {stats.creditsPercent}%
              <span className="ml-2 text-base font-medium text-slate-500">
                {formatCredits(stats.earnedCredits)} de {formatCredits(stats.totalCredits)} créditos
              </span>
            </p>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Cursos completados: <strong className="text-slate-900 dark:text-slate-100">{stats.coursesPercent}%</strong>
          </p>
        </div>
        <div className="mt-3">
          <ProgressBar value={stats.creditsPercent} label="Porcentaje de créditos aprobados" />
        </div>
      </div>
      <div className={`grid grid-cols-2 gap-3 ${detailed ? 'lg:grid-cols-4' : 'md:grid-cols-4'}`}>
        <StatTile icon={GraduationCap} accent label="Créditos obtenidos" value={formatCredits(stats.earnedCredits)} />
        <StatTile icon={Target} label="Créditos pendientes" value={formatCredits(stats.pendingCredits)} />
        <StatTile icon={BookCheck} accent label="Cursos aprobados" value={String(stats.approvedCourses)} hint={`de ${stats.totalCourses}`} />
        <StatTile icon={Hourglass} label="Cursos pendientes" value={String(stats.pendingCourses)} />
        {detailed && (
          <>
            <StatTile icon={BookOpen} label="Total de cursos" value={String(stats.totalCourses)} />
            <StatTile icon={Sigma} label="Créditos del programa" value={formatCredits(stats.totalCredits)} />
            <StatTile icon={LockOpen} label="Disponibles para cursar" value={String(stats.availableCourses)} />
            <StatTile icon={Lock} label="Bloqueados" value={String(stats.blockedCourses)} />
          </>
        )}
      </div>
    </div>
  );
}
