import type { Course, ProgressMap, Requirement } from '../../types/domain';
import { isApproved } from './credits';

/** Un requisito no cumplido, con lo que falta exactamente. */
export type MissingRequirement =
  | { type: 'courses'; mode: 'all' | 'any'; missingCourseIds: string[] }
  | { type: 'credits'; minCredits: number; earned: number; remaining: number };

export interface RequirementEvaluation {
  satisfied: boolean;
  missing: MissingRequirement[];
}

/**
 * Evalúa las reglas de un curso. Un grupo de cursos vacío (p. ej. tras eliminar el curso requerido)
 * no bloquea: no queda nada que exigir.
 */
export function evaluateRequirements(
  requirements: Requirement[],
  progress: ProgressMap,
  earned: number,
): RequirementEvaluation {
  const missing: MissingRequirement[] = [];
  for (const req of requirements) {
    if (req.type === 'credits') {
      if (earned < req.minCredits) {
        missing.push({
          type: 'credits',
          minCredits: req.minCredits,
          earned,
          remaining: Math.round((req.minCredits - earned) * 100) / 100,
        });
      }
      continue;
    }
    if (req.courseIds.length === 0) continue;
    const notApproved = req.courseIds.filter((id) => !isApproved(progress, id));
    const ok = req.mode === 'all' ? notApproved.length === 0 : notApproved.length < req.courseIds.length;
    if (!ok) missing.push({ type: 'courses', mode: req.mode, missingCourseIds: notApproved });
  }
  return { satisfied: missing.length === 0, missing };
}

/** Texto legible de un requisito faltante, para el panel de detalle y las advertencias. */
export function describeMissing(m: MissingRequirement, courseById: Map<string, Course>): string {
  if (m.type === 'credits') {
    return `Necesitas ${m.minCredits} créditos acumulados (tienes ${m.earned}; faltan ${m.remaining}).`;
  }
  const names = m.missingCourseIds.map((id) => {
    const c = courseById.get(id);
    return c ? `${c.code} · ${c.name}` : 'curso eliminado';
  });
  return m.mode === 'all'
    ? `Aprobar: ${names.join(', ')}.`
    : `Aprobar al menos uno de: ${names.join(', ')}.`;
}

/** Texto legible de una regla (cumplida o no), para listar los prerrequisitos de un curso. */
export function describeRequirement(r: Requirement, courseById: Map<string, Course>): string {
  if (r.type === 'credits') return `Mínimo ${r.minCredits} créditos acumulados`;
  const codes = r.courseIds.map((id) => courseById.get(id)?.code ?? '¿?');
  if (codes.length === 1) return `Aprobar ${codes[0]}`;
  return r.mode === 'all' ? `Aprobar todos: ${codes.join(', ')}` : `Aprobar uno de: ${codes.join(', ')}`;
}
