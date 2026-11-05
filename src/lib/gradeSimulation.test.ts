import { describe, expect, it } from 'vitest';
import type { Course, Term } from '../types/domain';
import { evaluationStatus, totalScore, zoneScore } from './engine/grades';
import { computeAcademicState } from './engine/academic';
import {
  fixSum,
  generateApprovedGroup,
  generateInProgress,
  generatePreapproved,
  planSimulation,
  runSimulation,
  seededRng,
  splitZone,
  validateSimulation,
} from './gradeSimulation';

const SEEDS = Array.from({ length: 300 }, (_, i) => i * 7919 + 1);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('herramientas', () => {
  it('la semilla reproduce exactamente el mismo resultado', () => {
    expect(generateApprovedGroup(35, seededRng(42))).toEqual(generateApprovedGroup(35, seededRng(42)));
    expect(generateApprovedGroup(35, seededRng(42))).not.toEqual(generateApprovedGroup(35, seededRng(43)));
  });

  it('fixSum respeta límites y suma objetivo', () => {
    const v = fixSum([0, 0, 50, 50], 5, 30, 70, seededRng(1));
    expect(sum(v)).toBe(70);
    expect(v.every((x) => x >= 5 && x <= 30)).toBe(true);
    expect(() => fixSum([1, 1], 0, 10, 25, seededRng(1))).toThrow();
  });

  it('splitZone reparte en 3 valores de 0–20 con la suma exacta', () => {
    for (const s of [0, 1, 25, 40, 59, 60]) {
      const p = splitZone(s, seededRng(s + 3));
      expect(sum(p)).toBe(s);
      expect(p.every((x) => x >= 0 && x <= 20)).toBe(true);
    }
  });
});

describe('grupo de 35 aprobados (300 semillas)', () => {
  it.each(SEEDS)('semilla %i: A = 10, promedio total 75, promedio EF 25, todos ≥ 61 y ≤ 100', (seed) => {
    const group = generateApprovedGroup(35, seededRng(seed));
    expect(group).toHaveLength(35);
    expect(group.every((g) => g.attendance === 10)).toBe(true);
    const totals = group.map((g) => totalScore(g)!);
    expect(sum(totals)).toBe(2625);
    expect(sum(group.map((g) => g.finalExam!))).toBe(875);
    expect(sum(group.map((g) => zoneScore(g)!))).toBe(1750); // zona promedio 50
    expect(totals.every((t) => t >= 61 && t <= 100)).toBe(true);
    expect(group.every((g) => zoneScore(g)! <= 70 && g.finalExam! <= 30 && g.finalExam! >= 0)).toBe(true);
    expect(group.every((g) => [g.exercises, g.partial1, g.partial2].every((x) => x! >= 0 && x! <= 20))).toBe(true);
    expect(group.every((g) => evaluationStatus(g) === 'approved')).toBe(true);
  });

  it('las notas son variadas (no todas iguales)', () => {
    const group = generateApprovedGroup(35, seededRng(7));
    expect(new Set(group.map((g) => totalScore(g))).size).toBeGreaterThan(8);
    expect(new Set(group.map((g) => g.finalExam)).size).toBeGreaterThan(4);
  });
});

describe('8.º ciclo (300 semillas)', () => {
  it.each(SEEDS.slice(0, 100))('semilla %i: preaprobados zona 61–70 y en curso zona ≤ 60, EF pendiente', (seed) => {
    const rng = seededRng(seed);
    const pre = generatePreapproved(2, rng);
    const cur = generateInProgress(3, rng);
    expect(pre.every((g) => g.attendance === 10 && g.finalExam === null && zoneScore(g)! >= 61 && zoneScore(g)! <= 70)).toBe(true);
    expect(pre.every((g) => evaluationStatus(g) === 'preapproved')).toBe(true);
    expect(cur.every((g) => g.attendance === 10 && g.finalExam === null && zoneScore(g)! >= 35 && zoneScore(g)! <= 60)).toBe(true);
    expect(cur.every((g) => evaluationStatus(g) === 'in_progress')).toBe(true);
    expect(validateSimulation({ approved: [], preapproved: pre, inProgress: cur })).toEqual([]);
  });
});

// Réplica del pensum real: 10 ciclos × 5 cursos; ciclos 1–8 aprobados hoy.
const NAMES_8 = ['Desarrollo Web', 'Análisis de Sistemas II', 'Redes de Computadoras I', 'Ética Profesional', 'Arquitectura de Computadoras II'];
const terms: Term[] = Array.from({ length: 10 }, (_, i) => ({ id: `t${i + 1}`, programId: 'p', name: `Ciclo ${i + 1}`, yearNumber: null, sortOrder: (i + 1) * 10, isDemo: false }));
const courses: Course[] = terms.flatMap((t, ti) =>
  Array.from({ length: 5 }, (_, j) => ({
    id: `c${ti * 5 + j + 1}`,
    programId: 'p',
    termId: t.id,
    code: String(90001 + ti * 5 + j).padStart(6, '0'),
    name: ti === 7 ? NAMES_8[j]! : `Curso ${ti * 5 + j + 1}`,
    credits: 5,
    area: null,
    description: null,
    sortOrder: (j + 1) * 10,
    isDemo: false,
  })),
);
const approvedToday = Object.fromEntries(courses.slice(0, 40).map((c) => [c.id, 'approved' as const]));
const ALL = { approved: true, preapproved: true, inProgress: true };

describe('plan sobre los cursos reales', () => {
  it('toma los primeros 35 aprobados en orden de ciclo y posición (ciclos 1–7)', () => {
    const plan = planSimulation(courses, terms, approvedToday, {}, ALL);
    expect(plan.approved.map((c) => c.id)).toEqual(courses.slice(0, 35).map((c) => c.id));
  });

  it('identifica Desarrollo Web y Ética Profesional por nombre, y los otros 3 del 8.º ciclo', () => {
    const plan = planSimulation(courses, terms, approvedToday, {}, ALL);
    expect(plan.preapproved.map((c) => c.name)).toEqual(['Desarrollo Web', 'Ética Profesional']);
    expect(plan.inProgress.map((c) => c.name)).toEqual(['Análisis de Sistemas II', 'Redes de Computadoras I', 'Arquitectura de Computadoras II']);
  });

  it('informa la discrepancia: los otros 3 del 8.º ciclo están aprobados hoy', () => {
    const plan = planSimulation(courses, terms, approvedToday, {}, ALL);
    expect(plan.discrepancies.filter((d) => d.includes('el escenario lo supone pendiente'))).toHaveLength(3);
  });

  it('nunca incluye cursos de los ciclos 9 y 10', () => {
    const plan = planSimulation(courses, terms, approvedToday, {}, ALL);
    const touched = new Set([...plan.approved, ...plan.preapproved, ...plan.inProgress].map((c) => c.termId));
    expect(touched.has('t9') || touched.has('t10')).toBe(false);
    expect(plan.untouchedLater).toHaveLength(10);
  });

  it('detecta calificaciones existentes que se sobrescribirían', () => {
    const existing = { c1: { attendance: 10, exercises: 15, partial1: 15, partial2: 15, finalExam: 20 } };
    const plan = planSimulation(courses, terms, approvedToday, existing, ALL);
    expect(plan.overwrites.map((c) => c.id)).toEqual(['c1']);
  });

  it('respeta las opciones por separado', () => {
    const only = planSimulation(courses, terms, approvedToday, {}, { approved: false, preapproved: true, inProgress: false });
    expect(only.approved).toHaveLength(0);
    expect(only.preapproved).toHaveLength(2);
    expect(only.inProgress).toHaveLength(0);
  });

  it('simulación completa: estados, créditos y ciclos 9–10 pendientes', () => {
    const plan = planSimulation(courses, terms, approvedToday, {}, ALL);
    const { byCourse, issues, result } = runSimulation(plan, 2026);
    expect(issues).toEqual([]);
    expect(sum(result.approved.map((g) => totalScore(g)!)) / 35).toBe(75);
    expect(sum(result.approved.map((g) => g.finalExam!)) / 35).toBe(25);
    const st = computeAcademicState(courses, {}, approvedToday, byCourse);
    expect(st.stats.evaluation).toEqual({ approved: 35, failed: 0, preapproved: 2, in_progress: 3, pending: 10 });
    expect(st.stats.earnedCredits).toBe(35 * 5); // los del 8.º ciclo dejan de sumar
    expect(st.stats.averages.definitive).toBe(75);
    expect(st.stats.averages.finalExam).toBe(25);
    for (const c of courses.slice(40)) {
      expect(byCourse[c.id]).toBeUndefined();
      expect(st.byCourse.get(c.id)!.evaluation).toBe('pending');
    }
    // No se pierden cursos ni créditos del programa.
    expect(st.stats.totalCourses).toBe(50);
    expect(st.stats.totalCredits).toBe(250);
  });
});
