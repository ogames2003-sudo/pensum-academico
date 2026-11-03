import { useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, Check, Eye, EyeOff, ImageUp, Layers, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { ProgramLogo } from '../../components/layout/ProgramLogo';
import type { AccentColor, OrganizationType, Program, Term } from '../../types/domain';
import { ORGANIZATION_LABELS } from '../../types/domain';
import { usePensum } from '../../context/PensumContext';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { ACCENTS, applyAccent } from '../../lib/theme';
import { formatCredits } from '../../lib/pensumView';
import { createProgram, createTerm, deleteTerm, reorder, updateProgram, updateTerm, type ProgramInput } from '../../services/pensumService';
import { friendlyError } from '../../services/supabase';

const slugify = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'programa';

export function ProgramPage() {
  const { status, error, data, academic, reload } = usePensum();
  if (status === 'loading') return <LoadingState />;
  if (status === 'error') return <ErrorState message={error ?? ''} onRetry={reload} />;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{data ? 'Programa académico' : 'Configura tu programa'}</h1>
        <p className="text-sm text-slate-500">
          {data ? 'Datos generales, publicación y estructura de ciclos.' : 'Primer paso: crea el programa (carrera, colegio o curso) que vas a administrar.'}
        </p>
      </div>
      <ProgramForm program={data?.program ?? null} />
      {data && academic && (
        <>
          <TermsManager terms={data.terms} programId={data.program.id} orgType={data.program.organizationType} courseCount={(id) => data.courses.filter((c) => c.termId === id).length} />
          <p className="text-sm text-slate-500">
            Créditos totales calculados del programa: <strong className="text-slate-900 dark:text-slate-100">{formatCredits(academic.stats.totalCredits)}</strong> ({academic.stats.totalCourses} cursos).
          </p>
        </>
      )}
    </div>
  );
}

function ProgramForm({ program }: { program: Program | null }) {
  const { reload } = usePensum();
  const { session } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState<ProgramInput>(() => ({
    name: program?.name ?? '',
    slug: program?.slug ?? '',
    institution: program?.institution ?? '',
    organizationType: program?.organizationType ?? 'semester',
    accentColor: program?.accentColor ?? 'azul',
    logoUrl: program?.logoUrl ?? null,
    isPublic: program?.isPublic ?? false,
    showProgressPublic: program?.showProgressPublic ?? false,
  }));
  const [initialTerms, setInitialTerms] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof ProgramInput>(k: K, v: ProgramInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!form.name.trim()) return setErr('El nombre del programa es obligatorio.');
    const termCount = initialTerms ? Number(initialTerms) : 0;
    if (!Number.isInteger(termCount) || termCount < 0 || termCount > 30) return setErr('El número de ciclos debe ser un entero entre 0 y 30.');
    const input = { ...form, slug: form.slug || slugify(form.name), showProgressPublic: form.isPublic && form.showProgressPublic };
    setSaving(true);
    try {
      if (program) {
        await updateProgram(program.id, input);
        toast.success('Programa guardado.');
      } else {
        const created = await createProgram(input, session!.user.id);
        const label = ORGANIZATION_LABELS[input.organizationType].singular;
        try {
          for (let i = 1; i <= termCount; i++) await createTerm(created.id, { name: `${label} ${i}`, yearNumber: null }, i * 10);
          toast.success('Programa creado.');
        } catch (termError) {
          // El programa sí existe: se informa con precisión qué faltó.
          toast.error(`Programa creado, pero no todos los ${label.toLowerCase()}s: ${friendlyError(termError)}`);
        }
      }
      await reload();
    } catch (e2) {
      setErr(friendlyError(e2));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-5 p-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="p-name" className="label">Nombre de la carrera o programa *</label>
          <input id="p-name" className="input" value={form.name} maxLength={160} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div>
          <label htmlFor="p-inst" className="label">Institución (opcional)</label>
          <input id="p-inst" className="input" value={form.institution ?? ''} maxLength={160} onChange={(e) => set('institution', e.target.value)} />
        </div>
        <div>
          <label htmlFor="p-org" className="label">Organización académica</label>
          <select id="p-org" className="input" value={form.organizationType} onChange={(e) => set('organizationType', e.target.value as OrganizationType)}>
            {Object.entries(ORGANIZATION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v.plural}</option>
            ))}
          </select>
        </div>
        {!program && (
          <div>
            <label htmlFor="p-terms" className="label">Número de {ORGANIZATION_LABELS[form.organizationType].plural.toLowerCase()} a crear</label>
            <input id="p-terms" type="number" min={0} max={30} className="input" placeholder="Ej.: 10" value={initialTerms} onChange={(e) => setInitialTerms(e.target.value)} />
            <p className="mt-1 text-xs text-slate-500">Podrás renombrarlos, agregar o quitar después.</p>
          </div>
        )}
      </div>

      <LogoPicker value={form.logoUrl} onChange={(v) => set('logoUrl', v)} />

      <div>
        <p className="label">Color de identidad</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color de identidad">
          {(Object.keys(ACCENTS) as AccentColor[]).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={form.accentColor === k}
              onClick={() => {
                set('accentColor', k);
                applyAccent(k);
              }}
              className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm ${form.accentColor === k ? 'border-slate-900 dark:border-white' : 'border-slate-200 dark:border-slate-700'}`}
            >
              <span className="flex">
                <span className="size-4 rounded-full ring-2 ring-white dark:ring-slate-900" style={{ background: ACCENTS[k].brand[600] }} />
                {ACCENTS[k].accent && <span className="-ml-1.5 size-4 rounded-full ring-2 ring-white dark:ring-slate-900" style={{ background: ACCENTS[k].accent[600] }} />}
              </span>
              {ACCENTS[k].label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/40">
        <Toggle
          checked={form.isPublic}
          onChange={(v) => set('isPublic', v)}
          label="Publicar el pensum"
          hint="Cualquier persona con el enlace podrá consultar los cursos, créditos y prerrequisitos, sin iniciar sesión."
        />
        <Toggle
          checked={form.isPublic && form.showProgressPublic}
          disabled={!form.isPublic}
          onChange={(v) => set('showProgressPublic', v)}
          label="Mostrar también el progreso académico"
          hint="Muestra qué cursos están aprobados o pendientes y las estadísticas de avance."
        />
      </div>

      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300" role="alert">No se guardó: {err}</p>}
      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" />} {program ? 'Guardar cambios' : 'Crear programa'}
        </button>
      </div>
    </form>
  );
}

const LOGO_MAX_PX = 256;
const LOGO_MAX_CHARS = 400_000; // mismo límite que la restricción de la base de datos

/** Reduce la imagen a ≤ 256 px y la convierte en data URL PNG (conserva la transparencia). */
async function imageToDataUrl(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Usa una imagen PNG, JPG o WebP.');
  if (file.size > 5 * 1024 * 1024) throw new Error('La imagen supera 5 MB.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      i.src = url;
    });
    const scale = Math.min(1, LOGO_MAX_PX / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    if (dataUrl.length > LOGO_MAX_CHARS) throw new Error('La imagen sigue siendo demasiado pesada; prueba con una más simple.');
    return dataUrl;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function LogoPicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <p className="label">Logo</p>
      <div className="flex flex-wrap items-center gap-4">
        <ProgramLogo logoUrl={value} size="lg" />
        <label className="btn-secondary cursor-pointer">
          <ImageUp className="size-4" /> {value ? 'Cambiar logo' : 'Subir logo'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              setError(null);
              try {
                onChange(await imageToDataUrl(file));
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          />
        </label>
        {value && (
          <button type="button" className="btn-ghost text-red-600" onClick={() => onChange(null)}>
            Quitar logo
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">PNG, JPG o WebP. Se reduce automáticamente. Se aplica al pulsar «Guardar cambios».</p>
      {error && <p className="mt-1 text-xs text-red-600" role="alert">{error}</p>}
    </div>
  );
}

function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string; disabled?: boolean }) {
  return (
    <label className={`flex items-start gap-3 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <input type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 ${checked ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-600'}`}>
        <span className={`size-4 rounded-full bg-white shadow transition ${checked ? 'translate-x-4' : ''}`} />
      </span>
      <span>
        <span className="flex items-center gap-1.5 text-sm font-medium">{checked ? <Eye className="size-4" /> : <EyeOff className="size-4" />} {label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
    </label>
  );
}

function TermsManager({ terms, programId, orgType, courseCount }: { terms: Term[]; programId: string; orgType: OrganizationType; courseCount: (termId: string) => number }) {
  const { reload } = usePensum();
  const confirm = useConfirm();
  const toast = useToast();
  const labels = ORGANIZATION_LABELS[orgType];
  const sorted = [...terms].sort((a, b) => a.sortOrder - b.sortOrder);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [year, setYear] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>, success?: string) {
    setBusy(true);
    try {
      await action();
      await reload();
      if (success) toast.success(success);
      return true;
    } catch (e) {
      toast.error(`No se guardó: ${friendlyError(e)}`);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const parseYear = (v: string) => (v.trim() ? Number(v) : null);
  const validYear = (v: string) => !v.trim() || (Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 20);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !validYear(year)) return toast.error(`Indica un nombre y un año válido (1–20).`);
    const order = (sorted.at(-1)?.sortOrder ?? 0) + 10;
    if (await run(() => createTerm(programId, { name, yearNumber: parseYear(year) }, order).then(() => {}), `${labels.singular} agregado.`)) {
      setName('');
      setYear('');
    }
  }

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Layers className="size-5 text-brand-600 dark:text-brand-100" />
        <h2 className="font-semibold">{labels.plural} ({sorted.length})</h2>
      </div>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {sorted.map((t, i) => (
          <TermRow
            key={t.id}
            term={t}
            courses={courseCount(t.id)}
            editing={editing === t.id}
            busy={busy}
            first={i === 0}
            last={i === sorted.length - 1}
            onEdit={() => setEditing(t.id)}
            onCancel={() => setEditing(null)}
            onSave={async (n, y) => {
              if (!n.trim() || !validYear(y)) return toast.error('Indica un nombre y un año válido (1–20).');
              if (await run(() => updateTerm(t.id, { name: n, yearNumber: parseYear(y) }), 'Guardado.')) setEditing(null);
            }}
            onMove={(delta) => {
              const ids = sorted.map((x) => x.id);
              [ids[i], ids[i + delta]] = [ids[i + delta]!, ids[i]!];
              void run(() => reorder('terms', ids));
            }}
            onDelete={async () => {
              const n = courseCount(t.id);
              const ok = await confirm({
                title: `Eliminar «${t.name}»`,
                tone: 'danger',
                confirmLabel: 'Eliminar',
                message: n ? `Sus ${n} curso(s) NO se eliminan: quedarán «sin ${labels.singular.toLowerCase()} asignado».` : '¿Eliminar este elemento vacío?',
              });
              if (ok) void run(() => deleteTerm(t.id), 'Eliminado.');
            }}
          />
        ))}
        {sorted.length === 0 && <li className="py-3 text-sm text-slate-500">Aún no hay {labels.plural.toLowerCase()}.</li>}
      </ul>
      <form onSubmit={add} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input className="input" placeholder={`Nombre (ej.: ${labels.singular} ${sorted.length + 1})`} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label={`Nombre del nuevo ${labels.singular.toLowerCase()}`} />
        <input className="input sm:w-32" type="number" min={1} max={20} placeholder="Año (opc.)" value={year} onChange={(e) => setYear(e.target.value)} aria-label="Año académico" />
        <button type="submit" className="btn-secondary shrink-0" disabled={busy}>
          <Plus className="size-4" /> Agregar
        </button>
      </form>
    </section>
  );
}

function TermRow(props: {
  term: Term;
  courses: number;
  editing: boolean;
  busy: boolean;
  first: boolean;
  last: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (name: string, year: string) => void;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
}) {
  const { term, editing, busy } = props;
  const [name, setName] = useState(term.name);
  const [year, setYear] = useState(term.yearNumber != null ? String(term.yearNumber) : '');
  if (editing) {
    return (
      <li className="flex flex-col gap-2 py-2 sm:flex-row">
        <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label="Nombre" autoFocus />
        <input className="input sm:w-28" type="number" min={1} max={20} placeholder="Año" value={year} onChange={(e) => setYear(e.target.value)} aria-label="Año" />
        <div className="flex gap-1">
          <button className="btn-primary px-3" disabled={busy} onClick={() => props.onSave(name, year)} aria-label="Guardar"><Check className="size-4" /></button>
          <button className="btn-ghost px-3" onClick={props.onCancel} aria-label="Cancelar"><X className="size-4" /></button>
        </div>
      </li>
    );
  }
  return (
    <li className="flex items-center gap-2 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {term.name}
          {term.isDemo && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">DEMO</span>}
        </p>
        <p className="text-xs text-slate-500">{term.yearNumber != null ? `Año ${term.yearNumber} · ` : ''}{props.courses} curso(s)</p>
      </div>
      <button className="btn-ghost p-1.5" disabled={busy || props.first} onClick={() => props.onMove(-1)} aria-label={`Subir ${term.name}`}><ArrowUp className="size-4" /></button>
      <button className="btn-ghost p-1.5" disabled={busy || props.last} onClick={() => props.onMove(1)} aria-label={`Bajar ${term.name}`}><ArrowDown className="size-4" /></button>
      <button className="btn-ghost p-1.5" onClick={props.onEdit} aria-label={`Editar ${term.name}`}><Pencil className="size-4" /></button>
      <button className="btn-ghost p-1.5 text-red-600" disabled={busy} onClick={props.onDelete} aria-label={`Eliminar ${term.name}`}><Trash2 className="size-4" /></button>
    </li>
  );
}
