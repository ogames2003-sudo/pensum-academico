/**
 * Calificaciones sobre 100 puntos: ZONA (A + E + E1 + E2, máx. 70) + EXAMEN FINAL (EF, máx. 30).
 * Aprobado con nota definitiva ≥ 61. `null` = calificación no registrada (se muestra «--»; NUNCA equivale a 0).
 * Este módulo es la única fuente del cálculo; la base de datos replica la misma regla (grade_status).
 */

export type GradeField = 'attendance' | 'exercises' | 'partial1' | 'partial2' | 'finalExam';

export type Grades = Record<GradeField, number | null>;

export const GRADE_FIELDS: { key: GradeField; code: string; label: string; max: number }[] = [
  { key: 'attendance', code: 'A', label: 'Asistencia', max: 10 },
  { key: 'exercises', code: 'E', label: 'Ejercicios', max: 20 },
  { key: 'partial1', code: 'E1', label: 'Examen parcial I', max: 20 },
  { key: 'partial2', code: 'E2', label: 'Examen parcial II', max: 20 },
  { key: 'finalExam', code: 'EF', label: 'Examen final', max: 30 },
];

export const ZONE_FIELDS: GradeField[] = ['attendance', 'exercises', 'partial1', 'partial2'];
export const ZONE_MAX = 70;
export const FINAL_MAX = 30;
export const TOTAL_MAX = 100;
export const PASSING_SCORE = 61;

export const EMPTY_GRADES: Grades = { attendance: null, exercises: null, partial1: null, partial2: null, finalExam: null };

/** Estado de evaluación. Independiente de la disponibilidad por prerrequisitos (bloqueado ≠ reprobado). */
export type EvaluationStatus = 'approved' | 'failed' | 'preapproved' | 'in_progress' | 'pending';

export const EVALUATION_LABELS: Record<EvaluationStatus, string> = {
  approved: 'Aprobado',
  failed: 'Reprobado',
  preapproved: 'Preaprobado',
  in_progress: 'En curso',
  pending: 'Pendiente',
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const maxOf = (field: GradeField) => GRADE_FIELDS.find((f) => f.key === field)!.max;

export const hasAnyGrade = (g: Grades | undefined): g is Grades =>
  !!g && GRADE_FIELDS.some((f) => g[f.key] !== null);

export const isZoneComplete = (g: Grades) => ZONE_FIELDS.every((k) => g[k] !== null);

/** Suma de la zona registrada; null si no hay ninguna actividad de zona registrada. */
export function zoneScore(g: Grades): number | null {
  const values = ZONE_FIELDS.map((k) => g[k]).filter((v): v is number => v !== null);
  return values.length ? round2(values.reduce((a, b) => a + b, 0)) : null;
}

/** Nota definitiva: solo con las cuatro actividades de zona Y el examen final registrados. */
export function totalScore(g: Grades): number | null {
  if (!isZoneComplete(g) || g.finalExam === null) return null;
  return round2(zoneScore(g)! + g.finalExam);
}

export function evaluationStatus(g: Grades | undefined): EvaluationStatus {
  if (!hasAnyGrade(g)) return 'pending';
  const total = totalScore(g);
  if (total !== null) return total >= PASSING_SCORE ? 'approved' : 'failed';
  // Preaprobado: zona completa ≥ 61 y EF sin registrar. Es provisional: no otorga créditos.
  if (g.finalExam === null && isZoneComplete(g) && zoneScore(g)! >= PASSING_SCORE) return 'preapproved';
  return 'in_progress';
}

/** Valida un valor (null = sin registrar). Devuelve el mensaje de error o null si es válido. */
export function validateGrade(field: GradeField, value: number | null): string | null {
  if (value === null) return null;
  if (!Number.isFinite(value)) return 'Debe ser un número.';
  if (value < 0) return 'No se permiten notas negativas.';
  if (value > maxOf(field)) return `El máximo es ${maxOf(field)}.`;
  if (Math.round(value * 100) !== value * 100) return 'Máximo dos decimales.';
  return null;
}

export function validateGrades(g: Grades): Partial<Record<GradeField, string>> {
  const errors: Partial<Record<GradeField, string>> = {};
  for (const f of GRADE_FIELDS) {
    const err = validateGrade(f.key, g[f.key]);
    if (err) errors[f.key] = err;
  }
  return errors;
}

/** «--» para lo no registrado; enteros sin decimales. */
export const formatScore = (n: number | null) => (n === null ? '--' : Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ''));

/** Texto de un campo de entrada → valor (vacío = null). Acepta coma decimal. */
export function parseScoreInput(raw: string): number | null {
  const v = raw.trim().replace(',', '.');
  if (v === '' || v === '--') return null;
  return Number(v);
}

export interface GradeAverages {
  /** Promedio de notas definitivas (aprobados + reprobados). */
  definitive: number | null;
  /** Promedio solo de los aprobados. */
  approvedOnly: number | null;
  /** Promedio de zona de cursos con zona completa. */
  zone: number | null;
  /** Promedio de exámenes finales registrados. */
  finalExam: number | null;
  definitiveCount: number;
}

const avg = (xs: number[]) => (xs.length ? round2(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/** Promedios sin contar lo pendiente como cero y sin incluir preaprobados en las notas definitivas. */
export function gradeAverages(all: Grades[]): GradeAverages {
  const totals = all.map(totalScore).filter((t): t is number => t !== null);
  return {
    definitive: avg(totals),
    approvedOnly: avg(totals.filter((t) => t >= PASSING_SCORE)),
    zone: avg(all.filter(isZoneComplete).map((g) => zoneScore(g)!)),
    finalExam: avg(all.map((g) => g.finalExam).filter((v): v is number => v !== null)),
    definitiveCount: totals.length,
  };
}
