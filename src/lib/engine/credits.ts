import type { Course, ProgressMap } from '../../types/domain';

export const isApproved = (progress: ProgressMap, courseId: string) => progress[courseId] === 'approved';

/** Redondeo a 2 decimales para evitar ruido de coma flotante (p. ej. 0.1 + 0.2). */
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Créditos obtenidos: exclusivamente la suma de cursos aprobados. */
export function earnedCredits(courses: Course[], progress: ProgressMap): number {
  return round2(courses.reduce((sum, c) => (isApproved(progress, c.id) ? sum + c.credits : sum), 0));
}

export function totalCredits(courses: Course[]): number {
  return round2(courses.reduce((sum, c) => sum + c.credits, 0));
}

/** Porcentaje 0–100 con un decimal. Con denominador 0 el avance es 0 (no hay nada que avanzar). */
export function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}
