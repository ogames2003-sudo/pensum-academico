import { useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardList, Dices, Loader2, Pencil, RefreshCw, Save, Trash2, X } from 'lucide-react';
import type { Course } from '../../types/domain';
import { usePensum } from '../../context/PensumContext';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { Modal } from '../../components/ui/Modal';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { EvaluationBadge } from '../../components/pensum/EvaluationBadge';
import { computeAcademicState, effectiveProgress, type GradesMap } from '../../lib/engine/academic';
import {
  EMPTY_GRADES,
  evaluationStatus,
  formatScore,
  GRADE_FIELDS,
  parseScoreInput,
  totalScore,
  validateGrades,
  zoneScore,
  type GradeField,
  type Grades,
} from '../../lib/engine/grades';
import { planSimulation, randomSeed, runSimulation, type SimulationParts, type SimulationPlan } from '../../lib/gradeSimulation';
import { formatCredits, groupByTerm } from '../../lib/pensumView';
import { friendlyError } from '../../services/supabase';

export function GradesPage() {
  const { status, error, data, academic, reload } = usePensum();
  const [editing, setEditing] = useState<Course | null>(null);

  if (status === 'loading') return <LoadingState />;
  if (status === 'error') return <ErrorState message={error ?? ''} onRetry={reload} />;
  if (!data || !academic) return null;
  if (!data.progressStudentId) {
    return <EmptyState icon={ClipboardList} title="Selecciona un estudiante">Elige arriba de quién registrar las calificaciones.</EmptyState>;
  }

  const sections = groupByTerm(data.terms, data.courses).filter((s) => s.courses.length);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Calificaciones</h1>
        <p className="text-sm text-slate-500">
          Zona (A 10 + E 20 + E1 20 + E2 20 = 70) + Examen final (30) = 100. Aprueba con 61. «--» = sin registrar.
        </p>
      </div>

      <SimulationTool />

      {sections.map((s) => (
        <section key={s.term?.id ?? 'none'} className="card overflow-hidden">
          <h2 className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold dark:border-slate-800 dark:bg-slate-800/40">
            {s.term?.name ?? 'Sin ciclo asignado'}
          </h2>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {s.courses.map((c) => {
              const g = data.grades[c.id];
              const st = academic.byCourse.get(c.id)!;
              const zone = g ? zoneScore(g) : null;
              const total = g ? totalScore(g) : null;
              return (
                <li key={c.id} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center">
                  <div className="min-w-0 md:w-64 md:shrink-0">
                    <p className="text-sm">
                      <span className="font-mono text-xs font-semibold text-slate-500">{c.code}</span> <span className="font-medium">{c.name}</span>
                    </p>
                    <div className="mt-1">
                      <EvaluationBadge status={st.evaluation} />
                      {!st.graded && st.evaluation === 'approved' && <span className="ml-2 text-[11px] text-slate-500">sin notas</span>}
                    </div>
                  </div>
                  <p className="flex-1 font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
                    {GRADE_FIELDS.map((f) => `${f.code}: ${formatScore(g ? g[f.key] : null)}`).join(' | ')}
                    <span className="mt-0.5 block font-sans">
                      Zona: <strong>{zone === null ? '--' : `${formatScore(zone)}/70`}</strong> · Total:{' '}
                      <strong>{total !== null ? `${formatScore(total)}/100` : zone !== null ? 'Pendiente' : '--'}</strong>
                    </span>
                  </p>
                  <button className="btn-secondary self-start px-3 py-1.5 text-xs md:self-auto" onClick={() => setEditing(c)}>
                    <Pencil className="size-3.5" /> Editar
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {editing && <GradeEditor key={editing.id} course={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ───────────────────────── Edición manual ─────────────────────────

function GradeEditor({ course, onClose }: { course: Course; onClose: () => void }) {
  const { data, saveCourseGrades, clearCourseGrades } = usePensum();
  const toast = useToast();
  const confirm = useConfirm();
  const initial = data!.grades[course.id] ?? EMPTY_GRADES;
  const [text, setText] = useState<Record<GradeField, string>>(
    () => Object.fromEntries(GRADE_FIELDS.map((f) => [f.key, initial[f.key] === null ? '' : String(initial[f.key])])) as Record<GradeField, string>,
  );
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const grades: Grades = Object.fromEntries(GRADE_FIELDS.map((f) => [f.key, parseScoreInput(text[f.key])])) as Grades;
  const errors = validateGrades(grades);
  const valid = Object.keys(errors).length === 0;
  const status = evaluationStatus(grades);
  const zone = zoneScore(grades);
  const total = totalScore(grades);
  const hadGrades = !!data!.grades[course.id];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    setServerError(null);
    try {
      await saveCourseGrades({ [course.id]: grades });
      toast.success(
        status === 'approved'
          ? `Curso aprobado: ${course.code} (${formatScore(total)}/100).`
          : status === 'failed'
            ? `Calificación actualizada: ${course.code} reprobado (${formatScore(total)}/100).`
            : status === 'preapproved' || status === 'in_progress'
              ? `Calificación actualizada: ${course.code} · examen final pendiente.`
              : `Calificación actualizada: ${course.code}.`,
      );
      onClose();
    } catch (err) {
      setServerError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  }

  async function onClear() {
    const ok = await confirm({
      title: `Borrar calificaciones de ${course.code}`,
      tone: 'danger',
      confirmLabel: 'Borrar calificaciones',
      message: 'Se eliminarán todas sus notas y el curso quedará pendiente (sin créditos aprobados).',
    });
    if (!ok) return;
    setSaving(true);
    try {
      await clearCourseGrades(course.id);
      toast.success(`Calificaciones de ${course.code} borradas.`);
      onClose();
    } catch (err) {
      setServerError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={`${course.code} · ${course.name}`}
      onClose={() => !saving && onClose()}
      footer={
        <>
          {hadGrades && (
            <button type="button" className="btn-ghost mr-auto text-red-600" onClick={onClear} disabled={saving}>
              <Trash2 className="size-4" /> Borrar
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" form="grade-form" className="btn-primary" disabled={saving || !valid}>
            {saving && <Loader2 className="size-4 animate-spin" />} Guardar
          </button>
        </>
      }
    >
      <form id="grade-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <p className="text-xs text-slate-500">Deja un campo vacío si la actividad aún no tiene nota (se mostrará «--», no cero).</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {GRADE_FIELDS.map((f) => (
            <div key={f.key}>
              <label htmlFor={`g-${f.key}`} className="label" title={f.label}>
                {f.code} <span className="font-normal text-slate-400">/{f.max}</span>
              </label>
              <input
                id={`g-${f.key}`}
                inputMode="decimal"
                className="input text-center font-mono"
                placeholder="--"
                value={text[f.key]}
                onChange={(e) => setText((t) => ({ ...t, [f.key]: e.target.value }))}
                aria-invalid={!!errors[f.key]}
                aria-describedby={errors[f.key] ? `g-${f.key}-err` : undefined}
              />
              <p className="mt-0.5 truncate text-[10px] text-slate-500">{f.label}</p>
              {errors[f.key] && <p id={`g-${f.key}-err`} className="text-xs text-red-600">{errors[f.key]}</p>}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60" aria-live="polite">
          <span>Zona: <strong className="tabular-nums">{zone === null ? '--' : `${formatScore(zone)}/70`}</strong></span>
          <span>Total: <strong className="tabular-nums">{total !== null ? `${formatScore(total)}/100` : zone !== null ? 'Pendiente' : '--'}</strong></span>
          {valid && <EvaluationBadge status={status} long />}
        </div>
        {serverError && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300" role="alert">No se guardó: {serverError}</p>}
      </form>
    </Modal>
  );
}

// ───────────────────────── Generador de calificaciones de prueba ─────────────────────────

type Option = 'all' | 'approved' | 'preapproved' | 'inProgress';
const OPTIONS: { key: Option; label: string; parts: SimulationParts }[] = [
  { key: 'all', label: 'Toda la simulación', parts: { approved: true, preapproved: true, inProgress: true } },
  { key: 'approved', label: 'Primeros 35 cursos aprobados', parts: { approved: true, preapproved: false, inProgress: false } },
  { key: 'preapproved', label: 'Desarrollo Web y Ética Profesional (preaprobados)', parts: { approved: false, preapproved: true, inProgress: false } },
  { key: 'inProgress', label: 'Otros 3 cursos del 8.º ciclo (en curso)', parts: { approved: false, preapproved: false, inProgress: true } },
];

interface Proposal {
  plan: SimulationPlan;
  seed: number;
  byCourse: GradesMap;
  issues: string[];
}

function SimulationTool() {
  const { data, saveCourseGrades } = usePensum();
  const toast = useToast();
  const confirm = useConfirm();
  const [option, setOption] = useState<Option>('all');
  const [seedText, setSeedText] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effective = useMemo(() => (data ? effectiveProgress(data.courses, data.progress, data.grades) : {}), [data]);
  if (!data) return null;

  function generate(seed: number) {
    setError(null);
    try {
      const plan = planSimulation(data!.courses, data!.terms, effective, data!.grades, OPTIONS.find((o) => o.key === option)!.parts);
      const { byCourse, issues } = runSimulation(plan, seed);
      setProposal({ plan, seed, byCourse, issues });
    } catch (e) {
      setProposal(null);
      setError((e as Error).message);
    }
  }

  const seedFromInput = () => {
    const n = Number(seedText.trim());
    return seedText.trim() && Number.isInteger(n) && n >= 0 ? n : randomSeed();
  };

  async function save() {
    if (!proposal || proposal.issues.length) return;
    const count = Object.keys(proposal.byCourse).length;
    const ok = await confirm({
      title: 'Guardar calificaciones de prueba',
      tone: proposal.plan.overwrites.length || proposal.plan.discrepancies.length ? 'warning' : 'default',
      confirmLabel: `Guardar ${count} cursos`,
      message: (
        <>
          <p>Se guardarán calificaciones FICTICIAS en <strong>{count} cursos</strong> en una sola operación.</p>
          {proposal.plan.overwrites.length > 0 && (
            <p className="mt-2">Se sobrescribirán las calificaciones existentes de: <strong>{proposal.plan.overwrites.map((c) => c.code).join(', ')}</strong>.</p>
          )}
          {proposal.plan.discrepancies.length > 0 && <p className="mt-2">Revisa las {proposal.plan.discrepancies.length} diferencias señaladas antes de continuar.</p>}
          <p className="mt-2">Los ciclos 9 y 10 no se modifican.</p>
        </>
      ),
    });
    if (!ok) return;
    setSaving(true);
    try {
      await saveCourseGrades(proposal.byCourse);
      toast.success(`Calificaciones de prueba guardadas en ${count} cursos.`);
      setProposal(null);
    } catch (e) {
      toast.error(`No se guardó nada: ${friendlyError(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <Dices className="size-5 text-brand-600 dark:text-brand-100" /> Generar calificaciones de prueba
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Notas ficticias para probar la interfaz. Nada se guarda hasta que confirmes la vista previa.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Qué generar">
        {OPTIONS.map((o) => (
          <label key={o.key} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${option === o.key ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30' : 'border-slate-200 dark:border-slate-700'}`}>
            <input type="radio" name="sim-option" className="accent-brand-600" checked={option === o.key} onChange={() => { setOption(o.key); setProposal(null); }} />
            {o.label}
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="sim-seed" className="label">Semilla (opcional)</label>
          <input id="sim-seed" className="input w-40 font-mono" inputMode="numeric" placeholder="aleatoria" value={seedText} onChange={(e) => setSeedText(e.target.value)} />
        </div>
        <button className="btn-primary" onClick={() => generate(seedFromInput())}>
          <Dices className="size-4" /> Generar propuesta
        </button>
      </div>
      {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
      {proposal && <ProposalView proposal={proposal} saving={saving} onRegenerate={() => generate(randomSeed())} onCancel={() => setProposal(null)} onSave={save} />}
    </section>
  );
}

function ProposalView({ proposal, saving, onRegenerate, onCancel, onSave }: {
  proposal: Proposal;
  saving: boolean;
  onRegenerate: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { data } = usePensum();
  const { plan, byCourse, issues, seed } = proposal;
  const before = computeAcademicState(data!.courses, data!.requirements, data!.progress, data!.grades);
  const after = computeAcademicState(data!.courses, data!.requirements, data!.progress, { ...data!.grades, ...byCourse });
  const approvedGrades = plan.approved.map((c) => byCourse[c.id]!);
  const avg = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : '--');
  const groups: { title: string; courses: Course[] }[] = [
    { title: `Grupo aprobado (${plan.approved.length})`, courses: plan.approved },
    { title: 'Preaprobados', courses: plan.preapproved },
    { title: 'En curso', courses: plan.inProgress },
  ].filter((g) => g.courses.length);

  return (
    <div className="mt-5 space-y-4 border-t border-slate-200 pt-5 dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Vista previa · semilla <span className="font-mono">{seed}</span></h3>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={onCancel} disabled={saving}><X className="size-4" /> Cancelar</button>
          <button className="btn-secondary" onClick={onRegenerate} disabled={saving}><RefreshCw className="size-4" /> Regenerar</button>
          <button className="btn-primary" onClick={onSave} disabled={saving || issues.length > 0 || Object.keys(byCourse).length === 0}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Guardar
          </button>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Summary label="Cursos a modificar" value={String(Object.keys(byCourse).length)} />
        {plan.approved.length > 0 && <Summary label="Promedio total (grupo)" value={`${avg(approvedGrades.map((g) => totalScore(g)!))}/100`} />}
        {plan.approved.length > 0 && <Summary label="Promedio EF (grupo)" value={`${avg(approvedGrades.map((g) => g.finalExam!))}/30`} />}
        <Summary label="Créditos aprobados" value={`${formatCredits(before.stats.earnedCredits)} → ${formatCredits(after.stats.earnedCredits)}`} />
      </dl>

      {issues.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="size-4" /> Cumple todas las restricciones (máximos, A = 10, promedios exactos, totales ≥ 61, zonas por escenario).</p>
      ) : (
        <ul className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300" role="alert">
          {issues.map((i) => <li key={i}>✗ {i}</li>)}
        </ul>
      )}
      {plan.discrepancies.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4" /> Diferencias con los datos reales</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">{plan.discrepancies.map((d) => <li key={d}>{d}</li>)}</ul>
        </div>
      )}
      {plan.overwrites.length > 0 && (
        <p className="text-sm text-amber-800 dark:text-amber-300">Ya tienen calificaciones (se sobrescribirían): {plan.overwrites.map((c) => c.code).join(', ')}.</p>
      )}
      <p className="text-xs text-slate-500">Ciclos 9 y 10: {plan.untouchedLater.length} cursos sin cambios (calificaciones «--»).</p>

      {groups.map((g) => (
        <div key={g.title} className="overflow-x-auto">
          <p className="mb-1 text-sm font-semibold">{g.title}</p>
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="py-1 pr-2 font-semibold">Curso</th>
                {GRADE_FIELDS.map((f) => <th key={f.key} className="px-1 py-1 text-right font-semibold">{f.code}</th>)}
                <th className="px-1 py-1 text-right font-semibold">Zona</th>
                <th className="px-1 py-1 text-right font-semibold">Total</th>
                <th className="py-1 pl-2 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {g.courses.map((c) => {
                const gr = byCourse[c.id]!;
                return (
                  <tr key={c.id}>
                    <td className="py-1 pr-2"><span className="font-mono text-slate-500">{c.code}</span> {c.name}</td>
                    {GRADE_FIELDS.map((f) => <td key={f.key} className="px-1 py-1 text-right font-mono tabular-nums">{formatScore(gr[f.key])}</td>)}
                    <td className="px-1 py-1 text-right font-mono tabular-nums">{formatScore(zoneScore(gr))}</td>
                    <td className="px-1 py-1 text-right font-mono tabular-nums">{totalScore(gr) === null ? 'Pend.' : formatScore(totalScore(gr))}</td>
                    <td className="py-1 pl-2"><EvaluationBadge status={evaluationStatus(gr)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
