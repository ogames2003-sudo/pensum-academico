/** Tipos de dominio. Independientes de Supabase: los servicios traducen filas ⇄ estos tipos. */

export type OrganizationType = 'semester' | 'cycle' | 'trimester' | 'quarter' | 'grade' | 'year';

export type AccentColor = 'azul' | 'indigo' | 'vino' | 'pizarra' | 'ambar' | 'rojoazul';

export interface Program {
  id: string;
  slug: string;
  name: string;
  institution: string | null;
  organizationType: OrganizationType;
  accentColor: AccentColor;
  /** Logo propio (data URL de imagen). null = ícono genérico. */
  logoUrl: string | null;
  /** El pensum es visible sin iniciar sesión. */
  isPublic: boolean;
  /** Además del pensum, el progreso (aprobado/pendiente) es visible públicamente. */
  showProgressPublic: boolean;
  /** Perfil cuyo progreso se administra y se publica. */
  studentId: string | null;
}

export interface Term {
  id: string;
  programId: string;
  name: string;
  /** Año académico (opcional) para agrupar ciclos. */
  yearNumber: number | null;
  sortOrder: number;
  isDemo: boolean;
}

export interface Course {
  id: string;
  programId: string;
  termId: string | null;
  code: string;
  name: string;
  credits: number;
  area: string | null;
  description: string | null;
  sortOrder: number;
  isDemo: boolean;
}

/**
 * Una regla de requisito. Un curso queda disponible cuando TODAS sus reglas se cumplen.
 * - courses/all: todos los cursos listados aprobados.
 * - courses/any: al menos uno aprobado.
 * - credits: créditos obtenidos ≥ minCredits.
 */
export type Requirement =
  | { id?: string; type: 'courses'; mode: 'all' | 'any'; courseIds: string[] }
  | { id?: string; type: 'credits'; minCredits: number };

export type ProgressStatus = 'approved' | 'pending';

/** Mapa courseId → estado. La ausencia equivale a «pendiente». */
export type ProgressMap = Record<string, ProgressStatus>;

export interface PensumData {
  program: Program;
  terms: Term[];
  courses: Course[];
  requirements: Record<string, Requirement[]>;
  progress: ProgressMap;
  /** false cuando el progreso no es visible para quien consulta (vista pública sin progreso). */
  progressVisible: boolean;
  /** Estudiante cuyo progreso se cargó (null = sin progreso). */
  progressStudentId: string | null;
}

export const ORGANIZATION_LABELS: Record<OrganizationType, { singular: string; plural: string }> = {
  semester: { singular: 'Semestre', plural: 'Semestres' },
  cycle: { singular: 'Ciclo', plural: 'Ciclos' },
  trimester: { singular: 'Trimestre', plural: 'Trimestres' },
  quarter: { singular: 'Cuatrimestre', plural: 'Cuatrimestres' },
  grade: { singular: 'Grado', plural: 'Grados' },
  year: { singular: 'Año', plural: 'Años' },
};
