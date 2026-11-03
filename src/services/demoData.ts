import type { Requirement, Term } from '../types/domain';
import { createTerm, saveCourse, setProgress } from './pensumService';

/**
 * Datos ficticios SOLO para probar la aplicación. Todos quedan marcados is_demo = true
 * y se eliminan con «Eliminar datos de demostración» sin afectar los cursos reales.
 *
 * Cubre: aprobado · pendiente disponible · pendiente bloqueado · prerrequisito específico ·
 * créditos mínimos · «uno de» un conjunto.
 */
const DEMO_TERMS = [
  { name: 'Ciclo demo 1', yearNumber: 1 },
  { name: 'Ciclo demo 2', yearNumber: 1 },
  { name: 'Ciclo demo 3', yearNumber: 2 },
];

interface DemoCourse {
  code: string;
  name: string;
  credits: number;
  term: number;
  area: string;
  approved?: boolean;
  requires?: { mode: 'all' | 'any'; codes: string[] };
  minCredits?: number;
}

const DEMO_COURSES: DemoCourse[] = [
  { code: 'DEMO-101', name: 'Fundamentos de ejemplo', credits: 4, term: 0, area: 'Básica', approved: true },
  { code: 'DEMO-102', name: 'Introducción de ejemplo', credits: 3, term: 0, area: 'Básica' },
  { code: 'DEMO-201', name: 'Continuación de ejemplo', credits: 4, term: 1, area: 'Básica', requires: { mode: 'all', codes: ['DEMO-101'] } },
  { code: 'DEMO-202', name: 'Taller de ejemplo', credits: 3, term: 1, area: 'Aplicada', requires: { mode: 'all', codes: ['DEMO-102'] } },
  { code: 'DEMO-301', name: 'Proyecto de ejemplo', credits: 5, term: 2, area: 'Aplicada', requires: { mode: 'any', codes: ['DEMO-201', 'DEMO-202'] }, minCredits: 10 },
  { code: 'DEMO-302', name: 'Seminario de ejemplo', credits: 0, term: 2, area: 'Complementaria', minCredits: 4 },
];

export async function loadDemoData(programId: string, studentId: string, existingTerms: Term[]): Promise<void> {
  const baseOrder = existingTerms.reduce((m, t) => Math.max(m, t.sortOrder), 0);
  const terms: Term[] = [];
  for (const [i, t] of DEMO_TERMS.entries()) {
    terms.push(await createTerm(programId, t, baseOrder + (i + 1) * 10, true));
  }
  const idByCode = new Map<string, string>();
  for (const [i, c] of DEMO_COURSES.entries()) {
    const requirements: Requirement[] = [];
    if (c.requires) requirements.push({ type: 'courses', mode: c.requires.mode, courseIds: c.requires.codes.map((code) => idByCode.get(code)!) });
    if (c.minCredits) requirements.push({ type: 'credits', minCredits: c.minCredits });
    const id = await saveCourse(
      programId,
      { termId: terms[c.term]!.id, code: c.code, name: c.name, credits: c.credits, area: c.area, description: 'Curso ficticio de demostración.', sortOrder: (i + 1) * 10, isDemo: true },
      requirements,
    );
    idByCode.set(c.code, id);
    if (c.approved) await setProgress(studentId, id, 'approved');
  }
}

export const DEMO_CODES = DEMO_COURSES.map((c) => c.code);
