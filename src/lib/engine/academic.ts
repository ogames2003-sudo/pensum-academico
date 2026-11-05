import type { Course, ProgressMap, ProgressStatus, Requirement } from '../../types/domain';
import { earnedCredits, isApproved, percent, totalCredits } from './credits';
import { evaluateRequirements, type MissingRequirement } from './requirements';
import { evaluationStatus, gradeAverages, hasAnyGrade, type EvaluationStatus, type GradeAverages, type Grades } from './grades';

export type Availability = 'approved' | 'available' | 'blocked';

/** Calificaciones por curso del estudiante en pantalla. */
export type GradesMap = Record<string, Grades>;

export interface CourseState {
  status: ProgressStatus;
  /** Para pendientes: disponible o bloqueado. Para aprobados: 'approved'. */
  availability: Availability;
  /** Estado de evaluación (aprobado, reprobado, preaprobado, en curso, pendiente). */
  evaluation: EvaluationStatus;
  /** true si el estado sale de calificaciones registradas; false si es una marca manual sin notas. */
  graded: boolean;
  missing: MissingRequirement[];
  /** Aprobado sin cumplir sus prerrequisitos (aprobación forzada por el administrador). */
  approvedWithUnmetRequirements: boolean;
}

export interface AcademicStats {
  totalCourses: number;
  approvedCourses: number;
  pendingCourses: number;
  availableCourses: number;
  blockedCourses: number;
  totalCredits: number;
  earnedCredits: number;
  pendingCredits: number;
  creditsPercent: number;
  coursesPercent: number;
  /** Desglose por estado de evaluación (pendingCourses incluye preaprobados, en curso y reprobados). */
  evaluation: Record<EvaluationStatus, number>;
  averages: GradeAverages;
}

export interface AcademicState {
  byCourse: Map<string, CourseState>;
  stats: AcademicStats;
}

/**
 * Aprobación efectiva: con calificaciones manda la nota definitiva (≥ 61); sin calificaciones,
 * la marca manual. Un preaprobado NO cuenta como aprobado: no da créditos ni desbloquea cursos.
 */
export function effectiveProgress(courses: Course[], progress: ProgressMap, grades: GradesMap = {}): ProgressMap {
  const result: ProgressMap = {};
  for (const c of courses) {
    const g = grades[c.id];
    const approved = hasAnyGrade(g) ? evaluationStatus(g) === 'approved' : isApproved(progress, c.id);
    if (approved) result[c.id] = 'approved';
  }
  return result;
}

/**
 * Punto único del cálculo académico: estado de cada curso + estadísticas.
 * La UI nunca recalcula créditos, notas ni requisitos por su cuenta.
 */
export function computeAcademicState(
  courses: Course[],
  requirements: Record<string, Requirement[]>,
  progress: ProgressMap,
  grades: GradesMap = {},
): AcademicState {
  const effective = effectiveProgress(courses, progress, grades);
  const earned = earnedCredits(courses, effective);
  const total = totalCredits(courses);
  const byCourse = new Map<string, CourseState>();
  const evaluation: Record<EvaluationStatus, number> = { approved: 0, failed: 0, preapproved: 0, in_progress: 0, pending: 0 };
  let approved = 0;
  let available = 0;
  let blocked = 0;

  for (const c of courses) {
    const g = grades[c.id];
    const graded = hasAnyGrade(g);
    const isOk = isApproved(effective, c.id);
    const evalStatus: EvaluationStatus = graded ? evaluationStatus(g) : isOk ? 'approved' : 'pending';
    evaluation[evalStatus]++;
    const req = evaluateRequirements(requirements[c.id] ?? [], effective, earned);
    if (isOk) {
      approved++;
      byCourse.set(c.id, {
        status: 'approved',
        availability: 'approved',
        evaluation: evalStatus,
        graded,
        missing: req.missing,
        approvedWithUnmetRequirements: !req.satisfied,
      });
    } else {
      if (req.satisfied) available++;
      else blocked++;
      byCourse.set(c.id, {
        status: 'pending',
        availability: req.satisfied ? 'available' : 'blocked',
        evaluation: evalStatus,
        graded,
        missing: req.missing,
        approvedWithUnmetRequirements: false,
      });
    }
  }

  const pendingCredits = Math.round((total - earned) * 100) / 100;
  return {
    byCourse,
    stats: {
      totalCourses: courses.length,
      approvedCourses: approved,
      pendingCourses: courses.length - approved,
      availableCourses: available,
      blockedCourses: blocked,
      totalCredits: total,
      earnedCredits: earned,
      pendingCredits,
      creditsPercent: percent(earned, total),
      coursesPercent: percent(approved, courses.length),
      evaluation,
      averages: gradeAverages(courses.map((c) => grades[c.id]).filter(hasAnyGrade)),
    },
  };
}

/** Cambio de estado inmutable. Solo afecta al curso indicado: nunca propaga a otros cursos. */
export function setCourseStatus(progress: ProgressMap, courseId: string, status: ProgressStatus): ProgressMap {
  const next = { ...progress };
  if (status === 'approved') next[courseId] = 'approved';
  else delete next[courseId];
  return next;
}
