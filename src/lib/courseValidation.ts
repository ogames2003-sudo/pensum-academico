import type { Course, Requirement } from '../types/domain';
import { MAX_CODE_LENGTH, MAX_NAME_LENGTH } from './csv';
import { wouldCreateCycle } from './engine/graph';

export interface CourseDraft {
  id?: string;
  code: string;
  name: string;
  credits: string;
  termId: string;
  area: string;
  description: string;
  sortOrder: number;
  requirements: Requirement[];
}

export type DraftErrors = Partial<Record<'code' | 'name' | 'credits' | 'requirements', string>>;

/** Requisitos listos para guardar: sin grupos vacíos ni duplicados. */
export function cleanRequirements(reqs: Requirement[]): Requirement[] {
  return reqs
    .map((r) => (r.type === 'courses' ? { ...r, courseIds: [...new Set(r.courseIds)] } : r))
    .filter((r) => (r.type === 'courses' ? r.courseIds.length > 0 : true));
}

/** Validación previa al guardado (la base de datos vuelve a validar códigos, créditos y ciclos). */
export function validateCourseDraft(
  draft: CourseDraft,
  ctx: { courses: Course[]; requirements: Record<string, Requirement[]> },
): DraftErrors {
  const errors: DraftErrors = {};
  const code = draft.code.trim().toUpperCase();
  if (!code) errors.code = 'El código es obligatorio.';
  else if (code.length > MAX_CODE_LENGTH) errors.code = `Máximo ${MAX_CODE_LENGTH} caracteres.`;
  else if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(code)) errors.code = 'Use letras, números, «-», «_» o «.» (sin espacios).';
  else if (ctx.courses.some((c) => c.code.toUpperCase() === code && c.id !== draft.id)) errors.code = 'Ya existe un curso con ese código.';

  const name = draft.name.trim();
  if (!name) errors.name = 'El nombre es obligatorio.';
  else if (name.length > MAX_NAME_LENGTH) errors.name = `Máximo ${MAX_NAME_LENGTH} caracteres.`;

  const credits = Number(draft.credits.replace(',', '.'));
  if (draft.credits.trim() === '' || !Number.isFinite(credits) || credits < 0 || credits > 999) {
    errors.credits = 'Ingrese un número entre 0 y 999.';
  }

  for (const r of draft.requirements) {
    if (r.type === 'credits' && (!Number.isFinite(r.minCredits) || r.minCredits <= 0)) {
      errors.requirements = 'Los créditos mínimos deben ser un número mayor que 0.';
    }
  }
  if (!errors.requirements) {
    const reqs = cleanRequirements(draft.requirements);
    const selfId = draft.id ?? '__new__';
    if (reqs.some((r) => r.type === 'courses' && r.courseIds.includes(selfId))) {
      errors.requirements = 'Un curso no puede requerirse a sí mismo.';
    } else {
      const cycle = wouldCreateCycle(ctx.requirements, selfId, reqs);
      if (cycle) {
        const codeOf = (id: string) => (id === selfId ? code || 'este curso' : (ctx.courses.find((c) => c.id === id)?.code ?? '?'));
        // Mostrar el ciclo empezando por el curso que se está editando.
        const core = cycle.slice(0, -1);
        const at = Math.max(core.indexOf(selfId), 0);
        const path = [...core.slice(at), ...core.slice(0, at), core[at]!];
        errors.requirements = `Dependencia circular: ${path.map(codeOf).join(' → ')}.`;
      }
    }
  }
  return errors;
}
