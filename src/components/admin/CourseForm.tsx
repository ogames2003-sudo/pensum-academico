import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import type { Course, PensumData } from '../../types/domain';
import { ORGANIZATION_LABELS } from '../../types/domain';
import { Modal } from '../ui/Modal';
import { RequirementEditor } from './RequirementEditor';
import { cleanRequirements, validateCourseDraft, type CourseDraft, type DraftErrors } from '../../lib/courseValidation';
import { saveCourse } from '../../services/pensumService';
import { friendlyError } from '../../services/supabase';
import { useToast } from '../ui/Toast';

interface Props {
  open: boolean;
  course: Course | null; // null = nuevo
  data: PensumData;
  defaultTermId?: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

function draftFrom(course: Course | null, data: PensumData, defaultTermId?: string): CourseDraft {
  if (course) {
    return {
      id: course.id,
      code: course.code,
      name: course.name,
      credits: String(course.credits),
      termId: course.termId ?? '',
      area: course.area ?? '',
      description: course.description ?? '',
      sortOrder: course.sortOrder,
      requirements: structuredClone(data.requirements[course.id] ?? []),
    };
  }
  const termId = defaultTermId ?? '';
  const sameTerm = data.courses.filter((c) => (c.termId ?? '') === termId);
  return {
    code: '',
    name: '',
    credits: '',
    termId,
    area: '',
    description: '',
    sortOrder: sameTerm.reduce((m, c) => Math.max(m, c.sortOrder), 0) + 10,
    requirements: [],
  };
}

export function CourseForm({ open, course, data, defaultTermId, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState(() => draftFrom(course, data, defaultTermId));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const toast = useToast();
  const labels = ORGANIZATION_LABELS[data.program.organizationType];
  const set = <K extends keyof CourseDraft>(k: K, v: CourseDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs = validateCourseDraft(draft, data);
    setErrors(errs);
    setServerError(null);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      await saveCourse(
        data.program.id,
        {
          id: draft.id,
          code: draft.code.trim().toUpperCase(),
          name: draft.name.trim(),
          credits: Number(draft.credits.replace(',', '.')),
          termId: draft.termId || null,
          area: draft.area.trim() || null,
          description: draft.description.trim() || null,
          sortOrder: draft.sortOrder,
        },
        cleanRequirements(draft.requirements),
      );
      await onSaved();
      toast.success(course ? 'Curso actualizado.' : 'Curso creado.');
      onClose();
    } catch (err) {
      setServerError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  }

  const field = (id: keyof DraftErrors) => (errors[id] ? { 'aria-invalid': true, 'aria-describedby': `${id}-err` } : {});
  const err = (id: keyof DraftErrors) =>
    errors[id] && (
      <p id={`${id}-err`} className="mt-1 text-xs text-red-600">
        {errors[id]}
      </p>
    );

  return (
    <Modal
      open={open}
      size="lg"
      title={course ? `Editar ${course.code}` : 'Nuevo curso'}
      onClose={() => !saving && onClose()}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" form="course-form" className="btn-primary" disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />} {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      <form id="course-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="c-code" className="label">Código *</label>
            <input id="c-code" className="input font-mono uppercase" value={draft.code} maxLength={30} onChange={(e) => set('code', e.target.value)} {...field('code')} />
            {err('code')}
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="c-name" className="label">Nombre *</label>
            <input id="c-name" className="input" value={draft.name} maxLength={160} onChange={(e) => set('name', e.target.value)} {...field('name')} />
            {err('name')}
          </div>
          <div>
            <label htmlFor="c-credits" className="label">Créditos *</label>
            <input id="c-credits" inputMode="decimal" className="input" value={draft.credits} placeholder="0" onChange={(e) => set('credits', e.target.value)} {...field('credits')} />
            {err('credits')}
          </div>
          <div>
            <label htmlFor="c-term" className="label">{labels.singular}</label>
            <select id="c-term" className="input" value={draft.termId} onChange={(e) => set('termId', e.target.value)}>
              <option value="">Sin asignar</option>
              {data.terms.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="c-area" className="label">Área académica</label>
            <input id="c-area" className="input" list="areas" value={draft.area} maxLength={80} onChange={(e) => set('area', e.target.value)} />
            <datalist id="areas">
              {[...new Set(data.courses.map((c) => c.area).filter(Boolean))].map((a) => (
                <option key={a} value={a!} />
              ))}
            </datalist>
          </div>
        </div>
        <div>
          <label htmlFor="c-desc" className="label">Descripción</label>
          <textarea id="c-desc" rows={2} className="input" value={draft.description} maxLength={2000} onChange={(e) => set('description', e.target.value)} />
        </div>
        <fieldset>
          <legend className="label">Prerrequisitos</legend>
          <RequirementEditor
            value={draft.requirements}
            onChange={(r) => set('requirements', r)}
            candidates={data.courses.filter((c) => c.id !== draft.id)}
          />
          {err('requirements')}
        </fieldset>
        {serverError && (
          <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300" role="alert">
            No se guardó: {serverError}
          </p>
        )}
      </form>
    </Modal>
  );
}
