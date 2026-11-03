import { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, FlaskConical, Loader2, Trash2, Upload } from 'lucide-react';
import { usePensum } from '../../context/PensumContext';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { CSV_COLUMNS, exportCoursesCsv, planImport, toCsv, type ImportPlan } from '../../lib/csv';
import { deleteDemoData, importCourses } from '../../services/pensumService';
import { DEMO_CODES, loadDemoData } from '../../services/demoData';
import { friendlyError } from '../../services/supabase';

function download(filename: string, content: string) {
  // BOM para que Excel reconozca UTF-8 (tildes y ñ).
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const MAX_FILE_BYTES = 2 * 1024 * 1024;

export function DataPage() {
  const { status, error, data, reload } = usePensum();
  const confirm = useConfirm();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState<'import' | 'demo' | 'clear' | null>(null);

  if (status === 'loading') return <LoadingState />;
  if (status === 'error') return <ErrorState message={error ?? ''} onRetry={reload} />;
  if (!data) return null;

  const demoCourses = data.courses.filter((c) => c.isDemo).length;
  const demoTerms = data.terms.filter((t) => t.isDemo).length;
  const demoCodeTaken = data.courses.some((c) => !c.isDemo && DEMO_CODES.includes(c.code));

  async function onFile(file: File | undefined) {
    setPlan(null);
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return toast.error('El archivo supera 2 MB.');
    setFileName(file.name);
    setPlan(planImport(await file.text(), data!));
  }

  async function runImport() {
    if (!plan || plan.errors.length) return;
    setBusy('import');
    try {
      const result = await importCourses(data!.program.id, plan.courses);
      await reload();
      toast.success(`Importación completa: ${result.created} creados, ${result.updated} actualizados.`);
      setPlan(null);
      if (fileInput.current) fileInput.current.value = '';
    } catch (e) {
      toast.error(`La importación no se aplicó (no se modificó nada): ${friendlyError(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function loadDemo() {
    setBusy('demo');
    try {
      await loadDemoData(data!.program.id, data!.program.studentId!, data!.terms);
      toast.success('Datos de demostración cargados.');
    } catch (e) {
      toast.error(`No se completó la carga de la demostración: ${friendlyError(e)}. Puedes eliminar lo cargado con «Eliminar datos de demostración».`);
    } finally {
      await reload();
      setBusy(null);
    }
  }

  async function clearDemo() {
    const ok = await confirm({
      title: 'Eliminar datos de demostración',
      tone: 'danger',
      confirmLabel: 'Eliminar demostración',
      message: `Se eliminarán ${demoCourses} curso(s) y ${demoTerms} ciclo(s) marcados como DEMO, con su progreso. Tus cursos reales no se modifican.`,
    });
    if (!ok) return;
    setBusy('clear');
    try {
      await deleteDemoData(data!.program.id);
      toast.success('Datos de demostración eliminados.');
    } catch (e) {
      toast.error(`No se eliminaron por completo: ${friendlyError(e)}`);
    } finally {
      await reload();
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Datos</h1>
        <p className="text-sm text-slate-500">Importa y exporta cursos en CSV, o gestiona los datos de demostración.</p>
      </div>

      <section className="card p-5">
        <h2 className="flex items-center gap-2 font-semibold"><Download className="size-5 text-brand-600 dark:text-brand-100" /> Exportar</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-secondary" disabled={!data.courses.length} onClick={() => download(`cursos-${data.program.slug}.csv`, exportCoursesCsv(data.courses, data.terms, data.requirements))}>
            <FileSpreadsheet className="size-4" /> Cursos (CSV)
          </button>
          <button className="btn-ghost" onClick={() => download('plantilla-cursos.csv', toCsv([[...CSV_COLUMNS], ['MAT101', 'Matemática I', '4', 'Semestre 1', '1', 'Ciencias', '10', '', '', ''], ['MAT102', 'Matemática II', '4', 'Semestre 2', '1', 'Ciencias', '10', '', 'MAT101', '']]))}>
            Descargar plantilla
          </button>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="flex items-center gap-2 font-semibold"><Upload className="size-5 text-brand-600 dark:text-brand-100" /> Importar cursos desde CSV</h2>
        <div className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300">
          <p>Columnas: <code className="text-xs">{CSV_COLUMNS.join(', ')}</code>. Obligatorias: codigo, nombre, creditos.</p>
          <p>Los cursos con un código existente se <strong>actualizan</strong>; los nuevos se crean. Los ciclos inexistentes se crean.</p>
          <p><code className="text-xs">prerrequisitos</code>: códigos separados por «;». Varios grupos con «|». Prefijo <code className="text-xs">uno:</code> = basta uno. Ej.: <code className="text-xs">MAT101;FIS101|uno:QUI101;BIO101</code></p>
          <p>Si omites las columnas de prerrequisitos, se conservan los requisitos actuales. La importación es de todo o nada.</p>
        </div>
        <input ref={fileInput} type="file" accept=".csv,text/csv" className="mt-4 block w-full text-sm file:mr-3 file:rounded-xl file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:font-medium file:text-brand-700" onChange={(e) => onFile(e.target.files?.[0])} aria-label="Archivo CSV" />

        {plan && (
          <div className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700" aria-live="polite">
            <p className="text-sm font-medium">{fileName}</p>
            {plan.errors.length ? (
              <>
                <p className="mt-2 flex items-center gap-2 text-sm font-medium text-red-600"><AlertCircle className="size-4" /> {plan.errors.length} problema(s): corrige el archivo y vuelve a cargarlo.</p>
                <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-sm text-red-700 dark:text-red-300">
                  {plan.errors.map((e, i) => (
                    <li key={i}>{e.row ? `Fila ${e.row}: ` : ''}{e.message}</li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <p className="mt-2 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="size-4" /> Archivo válido.</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {plan.toCreate} curso(s) nuevos · {plan.toUpdate} a actualizar
                  {plan.newTermNames.length > 0 && ` · ciclos nuevos: ${plan.newTermNames.join(', ')}`}
                </p>
                <button className="btn-primary mt-3" onClick={runImport} disabled={busy !== null}>
                  {busy === 'import' && <Loader2 className="size-4 animate-spin" />} Importar {plan.courses.length} curso(s)
                </button>
              </>
            )}
          </div>
        )}
      </section>

      <section className="card p-5">
        <h2 className="flex items-center gap-2 font-semibold"><FlaskConical className="size-5 text-brand-600 dark:text-brand-100" /> Datos de demostración</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Seis cursos ficticios en tres ciclos para probar la aplicación (aprobado, disponible, bloqueado, prerrequisitos y créditos mínimos).
          Quedan marcados como DEMO y se eliminan sin afectar tus cursos reales.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={loadDemo} disabled={busy !== null || demoCourses > 0 || demoCodeTaken || !data.program.studentId}>
            {busy === 'demo' && <Loader2 className="size-4 animate-spin" />} Cargar demostración
          </button>
          <button className="btn-ghost text-red-600" onClick={clearDemo} disabled={busy !== null || (demoCourses === 0 && demoTerms === 0)}>
            {busy === 'clear' ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Eliminar datos de demostración
          </button>
        </div>
        {demoCourses > 0 && <p className="mt-2 text-xs text-slate-500">Hay {demoCourses} curso(s) de demostración cargados.</p>}
        {demoCodeTaken && <p className="mt-2 text-xs text-slate-500">Algún curso real usa un código DEMO-xxx; no se puede cargar la demostración.</p>}
      </section>
    </div>
  );
}
