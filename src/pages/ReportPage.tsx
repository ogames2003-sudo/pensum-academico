import { Link } from 'react-router';
import { ArrowLeft, Printer } from 'lucide-react';
import { usePensum } from '../context/PensumContext';
import { useAuth } from '../context/AuthContext';
import { ErrorState, LoadingState, ProgressBar } from '../components/ui/States';
import { formatCredits, groupByTerm } from '../lib/pensumView';
import { describeRequirement } from '../lib/engine/requirements';
import { ORGANIZATION_LABELS } from '../types/domain';

/**
 * Reporte imprimible. «Exportar PDF» usa el diálogo de impresión del navegador → «Guardar como PDF»:
 * sin dependencias adicionales y con texto seleccionable.
 */
export function ReportPage() {
  const { status, error, data, academic, courseById, reload } = usePensum();
  const { isAdmin } = useAuth();
  if (status === 'loading') return <LoadingState />;
  if (status === 'error') return <ErrorState message={error ?? ''} onRetry={reload} />;
  if (!data || !academic) return <ErrorState message="No hay un programa disponible." />;

  const { stats } = academic;
  const show = data.progressVisible;
  const labels = ORGANIZATION_LABELS[data.program.organizationType];
  const sections = groupByTerm(data.terms, data.courses).filter((s) => s.courses.length);

  return (
    <div className="mx-auto max-w-4xl bg-white p-6 text-slate-900 sm:p-10 print:max-w-none print:p-0">
      <div className="no-print mb-6 flex flex-wrap justify-between gap-2">
        <Link to={isAdmin ? '/admin' : '/'} className="btn-secondary">
          <ArrowLeft className="size-4" /> Volver
        </Link>
        <button className="btn-primary" onClick={() => window.print()}>
          <Printer className="size-4" /> Imprimir / Guardar como PDF
        </button>
      </div>

      <header className="border-b-2 border-slate-900 pb-4">
        {data.program.institution && <p className="text-sm text-slate-600">{data.program.institution}</p>}
        <h1 className="text-2xl font-bold">{data.program.name}</h1>
        <p className="text-sm text-slate-600">
          Pensum{show ? ' y progreso académico' : ''} · generado el {new Date().toLocaleDateString('es', { dateStyle: 'long' })}
        </p>
      </header>

      <section className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 print-avoid-break">
        <Metric label="Créditos del programa" value={formatCredits(stats.totalCredits)} />
        <Metric label="Cursos" value={String(stats.totalCourses)} />
        {show && (
          <>
            <Metric label="Créditos obtenidos" value={`${formatCredits(stats.earnedCredits)} (${stats.creditsPercent}%)`} />
            <Metric label="Cursos aprobados" value={`${stats.approvedCourses} (${stats.coursesPercent}%)`} />
          </>
        )}
      </section>
      {show && (
        <div className="mt-3">
          <ProgressBar value={stats.creditsPercent} label="Avance en créditos" />
        </div>
      )}

      {sections.map((s) => (
        <section key={s.term?.id ?? 'none'} className="mt-6 print-avoid-break">
          <h2 className="mb-2 font-semibold">
            {s.term?.name ?? `Sin ${labels.singular.toLowerCase()} asignado`}
            {s.term?.yearNumber != null && <span className="font-normal text-slate-500"> · Año {s.term.yearNumber}</span>}
          </h2>
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-300 text-slate-600">
                <th className="py-1.5 pr-2 font-semibold">Código</th>
                <th className="py-1.5 pr-2 font-semibold">Curso</th>
                <th className="py-1.5 pr-2 text-right font-semibold">Créd.</th>
                <th className="py-1.5 pr-2 font-semibold">Prerrequisitos</th>
                {show && <th className="py-1.5 font-semibold">Estado</th>}
              </tr>
            </thead>
            <tbody>
              {s.courses.map((c) => {
                const st = academic.byCourse.get(c.id);
                const approved = st?.status === 'approved';
                return (
                  <tr key={c.id} className={`border-b border-slate-200 ${show && approved ? 'bg-emerald-50' : ''}`}>
                    <td className="py-1.5 pr-2 font-mono">{c.code}</td>
                    <td className="py-1.5 pr-2">{c.name}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{formatCredits(c.credits)}</td>
                    <td className="py-1.5 pr-2 text-slate-600">
                      {(data.requirements[c.id] ?? []).map((r) => describeRequirement(r, courseById)).join('; ') || '—'}
                    </td>
                    {show && (
                      <td className={`py-1.5 font-medium ${approved ? 'text-emerald-700' : 'text-slate-600'}`}>
                        {approved ? '✓ Aprobado' : st?.availability === 'blocked' ? 'Pendiente (bloqueado)' : 'Pendiente (disponible)'}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
