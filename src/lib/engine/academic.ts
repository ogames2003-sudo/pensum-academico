import type { Course, ProgressMap, ProgressStatus, Requirement } from '../../types/domain';
import { earnedCredits, isApproved, percent, totalCredits } from './credits';
import { evaluateRequirements, type MissingRequirement } from './requirements';

export type Availability = 'approved' | 'available' | 'blocked';

export interface CourseState {
  status: ProgressStatus;
  /** Para pendientes: disponible o bloqueado. Para aprobados: 'approved'. */
  availability: Availability;
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
}

export interface AcademicState {
  byCourse: Map<string, CourseState>;
  stats: AcademicStats;
}

/**
 * Punto único del cálculo académico: estado de cada curso + estadísticas.
 * La UI nunca recalcula créditos ni requisitos por su cuenta.
 */
export function computeAcademicState(
  courses: Course[],
  requirements: Record<string, Requirement[]>,
  progress: ProgressMap,
): AcademicState {
  const earned = earnedCredits(courses, progress);
  const total = totalCredits(courses);
  const byCourse = new Map<string, CourseState>();
  let approved = 0;
  let available = 0;
  let blocked = 0;

  for (const c of courses) {
    const evaluation = evaluateRequirements(requirements[c.id] ?? [], progress, earned);
    if (isApproved(progress, c.id)) {
      approved++;
      byCourse.set(c.id, {
        status: 'approved',
        availability: 'approved',
        missing: evaluation.missing,
        approvedWithUnmetRequirements: !evaluation.satisfied,
      });
    } else {
      if (evaluation.satisfied) available++;
      else blocked++;
      byCourse.set(c.id, {
        status: 'pending',
        availability: evaluation.satisfied ? 'available' : 'blocked',
        missing: evaluation.missing,
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
