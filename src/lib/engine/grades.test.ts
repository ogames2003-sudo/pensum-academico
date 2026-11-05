import { describe, expect, it } from 'vitest';
import type { Course } from '../../types/domain';
import { computeAcademicState } from './academic';
import {
  EMPTY_GRADES,
  evaluationStatus,
  formatScore,
  gradeAverages,
  parseScoreInput,
  totalScore,
  validateGrade,
  validateGrades,
  zoneScore,
  type Grades,
} from './grades';

const g = (a: number | null, e: number | null, e1: number | null, e2: number | null, ef: number | null): Grades => ({
  attendance: a,
  exercises: e,
  partial1: e1,
  partial2: e2,
  finalExam: ef,
});

describe('zona y nota total', () => {
  it('calcula ZONA = A + E + E1 + E2 y TOTAL = ZONA + EF', () => {
    const x = g(10, 14, 13, 15, 24);
    expect(zoneScore(x)).toBe(52);
    expect(totalScore(x)).toBe(76);
  });

  it('en los máximos: zona 70, total 100', () => {
    const x = g(10, 20, 20, 20, 30);
    expect(zoneScore(x)).toBe(70);
    expect(totalScore(x)).toBe(100);
  });

  it('sin EF no hay nota definitiva aunque la zona alcance 61', () => {
    expect(totalScore(g(10, 20, 20, 15, null))).toBeNull();
  });

  it('si falta una actividad de zona tampoco hay nota definitiva', () => {
    expect(totalScore(g(10, null, 20, 20, 30))).toBeNull();
  });

  it('distingue cero de «no registrado»', () => {
    expect(zoneScore(g(0, 0, 0, 0, null))).toBe(0);
    expect(zoneScore(EMPTY_GRADES)).toBeNull();
    expect(totalScore(g(0, 0, 0, 0, 0))).toBe(0);
    expect(evaluationStatus(g(0, 0, 0, 0, 0))).toBe('failed');
    expect(evaluationStatus(EMPTY_GRADES)).toBe('pending');
    expect(formatScore(null)).toBe('--');
    expect(formatScore(0)).toBe('0');
  });
});

describe('estado de evaluación', () => {
  it('aprobado con 61 exactos; reprobado con 60.99', () => {
    expect(evaluationStatus(g(10, 10, 10, 10, 21))).toBe('approved');
    expect(evaluationStatus(g(10, 10, 10, 10, 20.99))).toBe('failed');
  });

  it('ejemplos del enunciado: 48 + 20 = 68 aprobado; 42 + 15 = 57 reprobado', () => {
    expect(evaluationStatus(g(10, 13, 12, 13, 20))).toBe('approved');
    expect(evaluationStatus(g(10, 10, 11, 11, 15))).toBe('failed');
  });

  it('preaprobado: zona completa entre 61 y 70 sin EF', () => {
    expect(evaluationStatus(g(10, 19, 17, 16, null))).toBe('preapproved');
    expect(evaluationStatus(g(10, 20, 20, 20, null))).toBe('preapproved');
  });

  it('en curso: zona < 61 sin EF, o actividades incompletas', () => {
    expect(evaluationStatus(g(10, 12, 11, 14, null))).toBe('in_progress');
    expect(evaluationStatus(g(10, null, null, null, null))).toBe('in_progress');
    expect(evaluationStatus(g(10, 20, 20, null, 30))).toBe('in_progress');
  });
});

describe('validación', () => {
  it('rechaza negativos, excesos y más de dos decimales; acepta null', () => {
    expect(validateGrade('attendance', -1)).toMatch(/negativas/);
    expect(validateGrade('attendance', 10.5)).toMatch(/máximo es 10/);
    expect(validateGrade('finalExam', 31)).toMatch(/30/);
    expect(validateGrade('exercises', 12.345)).toMatch(/decimales/);
    expect(validateGrade('exercises', 12.5)).toBeNull();
    expect(validateGrade('finalExam', null)).toBeNull();
    expect(Object.keys(validateGrades(g(11, 21, 0, 0, 0)))).toEqual(['attendance', 'exercises']);
  });

  it('interpreta la entrada: vacío y «--» son null; acepta coma decimal', () => {
    expect(parseScoreInput('')).toBeNull();
    expect(parseScoreInput('--')).toBeNull();
    expect(parseScoreInput('12,5')).toBe(12.5);
    expect(parseScoreInput('0')).toBe(0);
  });
});

describe('promedios', () => {
  it('no cuenta pendientes como cero ni preaprobados como definitivos', () => {
    const avgs = gradeAverages([g(10, 14, 13, 15, 24), g(10, 10, 11, 11, 15), g(10, 19, 17, 16, null), g(null, null, null, null, null)]);
    expect(avgs.definitive).toBe(66.5); // (76 + 57) / 2
    expect(avgs.approvedOnly).toBe(76);
    expect(avgs.zone).toBe(52); // (52 + 42 + 62) / 3
    expect(avgs.finalExam).toBe(19.5);
    expect(avgs.definitiveCount).toBe(2);
  });
});

describe('integración con créditos y prerrequisitos', () => {
  const course = (id: string, credits: number): Course => ({
    id, programId: 'p', termId: null, code: id, name: id, credits, area: null, description: null, sortOrder: 0, isDemo: false,
  });
  const courses = [course('a', 5), course('b', 4), course('c', 3)];
  const reqs = { c: [{ type: 'courses' as const, mode: 'all' as const, courseIds: ['a'] }] };

  it('la nota manda sobre la marca manual: preaprobado no da créditos ni desbloquea', () => {
    const st = computeAcademicState(courses, reqs, { a: 'approved' }, { a: g(10, 19, 17, 16, null) });
    expect(st.byCourse.get('a')!.evaluation).toBe('preapproved');
    expect(st.byCourse.get('a')!.status).toBe('pending');
    expect(st.stats.earnedCredits).toBe(0);
    expect(st.byCourse.get('c')!.availability).toBe('blocked');
  });

  it('al registrar EF ≥ 61 total: pasa a aprobado, suma créditos y desbloquea', () => {
    const st = computeAcademicState(courses, reqs, {}, { a: g(10, 13, 12, 13, 20) });
    expect(st.byCourse.get('a')!.status).toBe('approved');
    expect(st.stats.earnedCredits).toBe(5);
    expect(st.byCourse.get('c')!.availability).toBe('available');
  });

  it('si una corrección baja la nota a < 61, deja de estar aprobado', () => {
    const st = computeAcademicState(courses, reqs, { a: 'approved' }, { a: g(10, 10, 11, 11, 15) });
    expect(st.byCourse.get('a')!.evaluation).toBe('failed');
    expect(st.stats.earnedCredits).toBe(0);
    expect(st.byCourse.get('c')!.availability).toBe('blocked');
  });

  it('sin calificaciones conserva la marca manual (datos existentes)', () => {
    const st = computeAcademicState(courses, reqs, { b: 'approved' }, {});
    expect(st.byCourse.get('b')!.evaluation).toBe('approved');
    expect(st.byCourse.get('b')!.graded).toBe(false);
    expect(st.stats.earnedCredits).toBe(4);
    expect(st.stats.evaluation).toEqual({ approved: 1, failed: 0, preapproved: 0, in_progress: 0, pending: 2 });
  });
});
