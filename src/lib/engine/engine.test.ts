import { describe, expect, it } from 'vitest';
import type { Course, ProgressMap, Requirement } from '../../types/domain';
import { computeAcademicState, setCourseStatus } from './academic';
import { earnedCredits, percent, totalCredits } from './credits';
import { buildGraph, dependentsOf, findCycle, wouldCreateCycle } from './graph';
import { describeMissing, evaluateRequirements } from './requirements';

const course = (id: string, credits: number): Course => ({
  id,
  programId: 'p',
  termId: null,
  code: id.toUpperCase(),
  name: `Curso ${id}`,
  credits,
  area: null,
  description: null,
  sortOrder: 0,
  isDemo: false,
});

const courses = [course('a', 4), course('b', 3), course('c', 4), course('d', 0), course('e', 5)];

describe('créditos', () => {
  it('suma solo los cursos aprobados', () => {
    expect(earnedCredits(courses, { a: 'approved', b: 'pending', d: 'approved' })).toBe(4);
    expect(earnedCredits(courses, {})).toBe(0);
  });

  it('admite cursos de 0 créditos en el total', () => {
    expect(totalCredits(courses)).toBe(16);
    expect(totalCredits([course('x', 0)])).toBe(0);
  });

  it('evita ruido de coma flotante', () => {
    expect(totalCredits([course('x', 0.1), course('y', 0.2)])).toBe(0.3);
  });
});

describe('porcentajes', () => {
  it('redondea a un decimal', () => {
    expect(percent(1, 3)).toBe(33.3);
    expect(percent(2, 3)).toBe(66.7);
    expect(percent(16, 16)).toBe(100);
  });

  it('devuelve 0 con denominador 0', () => {
    expect(percent(0, 0)).toBe(0);
  });
});

describe('requisitos', () => {
  const needsA: Requirement = { type: 'courses', mode: 'all', courseIds: ['a'] };

  it('sin requisitos siempre se cumple', () => {
    expect(evaluateRequirements([], {}, 0).satisfied).toBe(true);
  });

  it('curso específico aprobado', () => {
    expect(evaluateRequirements([needsA], { a: 'approved' }, 4).satisfied).toBe(true);
    const r = evaluateRequirements([needsA], {}, 0);
    expect(r.satisfied).toBe(false);
    expect(r.missing).toEqual([{ type: 'courses', mode: 'all', missingCourseIds: ['a'] }]);
  });

  it('todos de un conjunto: lista solo los que faltan', () => {
    const req: Requirement = { type: 'courses', mode: 'all', courseIds: ['a', 'b', 'c'] };
    const r = evaluateRequirements([req], { b: 'approved' }, 3);
    expect(r.missing).toEqual([{ type: 'courses', mode: 'all', missingCourseIds: ['a', 'c'] }]);
  });

  it('cualquiera de un conjunto', () => {
    const req: Requirement = { type: 'courses', mode: 'any', courseIds: ['a', 'b'] };
    expect(evaluateRequirements([req], { b: 'approved' }, 3).satisfied).toBe(true);
    expect(evaluateRequirements([req], {}, 0).satisfied).toBe(false);
  });

  it('créditos mínimos: el límite es inclusivo', () => {
    const req: Requirement = { type: 'credits', minCredits: 7 };
    expect(evaluateRequirements([req], {}, 7).satisfied).toBe(true);
    const r = evaluateRequirements([req], {}, 4);
    expect(r.missing).toEqual([{ type: 'credits', minCredits: 7, earned: 4, remaining: 3 }]);
  });

  it('combinación de curso + créditos: falta cada parte por separado', () => {
    const reqs: Requirement[] = [needsA, { type: 'credits', minCredits: 10 }];
    const r = evaluateRequirements(reqs, { a: 'approved' }, 4);
    expect(r.satisfied).toBe(false);
    expect(r.missing).toHaveLength(1);
    expect(r.missing[0]!.type).toBe('credits');
  });

  it('un grupo vacío (curso requerido eliminado) no bloquea', () => {
    expect(evaluateRequirements([{ type: 'courses', mode: 'all', courseIds: [] }], {}, 0).satisfied).toBe(true);
  });

  it('describe exactamente lo que falta', () => {
    const byId = new Map(courses.map((c) => [c.id, c]));
    expect(describeMissing({ type: 'courses', mode: 'all', missingCourseIds: ['a'] }, byId)).toBe('Aprobar: A · Curso a.');
    expect(describeMissing({ type: 'credits', minCredits: 10, earned: 4, remaining: 6 }, byId)).toContain('faltan 6');
  });
});

describe('estado académico', () => {
  const requirements: Record<string, Requirement[]> = {
    b: [{ type: 'courses', mode: 'all', courseIds: ['a'] }],
    c: [{ type: 'courses', mode: 'all', courseIds: ['b'] }],
    e: [{ type: 'credits', minCredits: 4 }],
  };

  it('clasifica aprobado, disponible y bloqueado', () => {
    const { byCourse, stats } = computeAcademicState(courses, requirements, { a: 'approved' });
    expect(byCourse.get('a')!.availability).toBe('approved');
    expect(byCourse.get('b')!.availability).toBe('available');
    expect(byCourse.get('c')!.availability).toBe('blocked');
    expect(byCourse.get('d')!.availability).toBe('available');
    expect(byCourse.get('e')!.availability).toBe('available'); // 4 créditos ≥ 4
    expect(stats).toMatchObject({
      totalCourses: 5,
      approvedCourses: 1,
      pendingCourses: 4,
      availableCourses: 3,
      blockedCourses: 1,
      totalCredits: 16,
      earnedCredits: 4,
      pendingCredits: 12,
      creditsPercent: 25,
      coursesPercent: 20,
    });
  });

  it('pensum vacío: todo en cero', () => {
    const { stats } = computeAcademicState([], {}, {});
    expect(stats.totalCourses).toBe(0);
    expect(stats.creditsPercent).toBe(0);
    expect(stats.coursesPercent).toBe(0);
  });

  it('marca la aprobación forzada sin requisitos cumplidos', () => {
    const { byCourse } = computeAcademicState(courses, requirements, { c: 'approved' });
    expect(byCourse.get('c')!.status).toBe('approved');
    expect(byCourse.get('c')!.approvedWithUnmetRequirements).toBe(true);
  });

  it('los cursos que se desbloquean se recalculan, no se aprueban', () => {
    const before = computeAcademicState(courses, requirements, { a: 'approved' });
    const after = computeAcademicState(courses, requirements, setCourseStatus({ a: 'approved' }, 'b', 'approved'));
    expect(before.byCourse.get('c')!.availability).toBe('blocked');
    expect(after.byCourse.get('c')!.availability).toBe('available');
    expect(after.byCourse.get('c')!.status).toBe('pending');
    expect(after.stats.earnedCredits).toBe(7);
  });
});

describe('modificación de estados', () => {
  it('aprueba y revierte sin mutar el original ni tocar otros cursos', () => {
    const original: ProgressMap = { a: 'approved' };
    const approved = setCourseStatus(original, 'b', 'approved');
    expect(approved).toEqual({ a: 'approved', b: 'approved' });
    expect(original).toEqual({ a: 'approved' });
    const reverted = setCourseStatus(approved, 'a', 'pending');
    expect(reverted).toEqual({ b: 'approved' });
  });

  it('desaprobar un prerrequisito no cambia el estado de los dependientes', () => {
    const progress = setCourseStatus({ a: 'approved', b: 'approved' }, 'a', 'pending');
    expect(progress.b).toBe('approved');
  });
});

describe('dependencias circulares', () => {
  it('detecta ciclos directos, indirectos y auto-referencias', () => {
    expect(findCycle(buildGraph({ a: [{ type: 'courses', mode: 'all', courseIds: ['a'] }] }))).toEqual(['a', 'a']);
    const cyc = findCycle(
      buildGraph({
        a: [{ type: 'courses', mode: 'all', courseIds: ['b'] }],
        b: [{ type: 'courses', mode: 'any', courseIds: ['x', 'c'] }],
        c: [{ type: 'courses', mode: 'all', courseIds: ['a'] }],
      }),
    );
    expect(cyc).not.toBeNull();
    expect(cyc![0]).toBe(cyc![cyc!.length - 1]);
    expect(new Set(cyc)).toEqual(new Set(['a', 'b', 'c']));
  });

  it('acepta grafos sin ciclos (diamante)', () => {
    expect(
      findCycle(
        buildGraph({
          d: [{ type: 'courses', mode: 'all', courseIds: ['b', 'c'] }],
          b: [{ type: 'courses', mode: 'all', courseIds: ['a'] }],
          c: [{ type: 'courses', mode: 'all', courseIds: ['a'] }],
          a: [{ type: 'credits', minCredits: 3 }],
        }),
      ),
    ).toBeNull();
  });

  it('wouldCreateCycle evalúa el cambio propuesto', () => {
    const reqs: Record<string, Requirement[]> = { b: [{ type: 'courses', mode: 'all', courseIds: ['a'] }] };
    expect(wouldCreateCycle(reqs, 'a', [{ type: 'courses', mode: 'all', courseIds: ['b'] }])).not.toBeNull();
    expect(wouldCreateCycle(reqs, 'c', [{ type: 'courses', mode: 'all', courseIds: ['b'] }])).toBeNull();
  });

  it('soporta cadenas largas sin desbordar la pila', () => {
    const reqs: Record<string, Requirement[]> = {};
    for (let i = 1; i < 20000; i++) reqs[`c${i}`] = [{ type: 'courses', mode: 'all', courseIds: [`c${i - 1}`] }];
    expect(findCycle(buildGraph(reqs))).toBeNull();
    expect(wouldCreateCycle(reqs, 'c0', [{ type: 'courses', mode: 'all', courseIds: ['c19999'] }])).not.toBeNull();
  });

  it('lista los dependientes directos', () => {
    const reqs: Record<string, Requirement[]> = {
      b: [{ type: 'courses', mode: 'all', courseIds: ['a'] }],
      c: [{ type: 'credits', minCredits: 2 }],
    };
    expect(dependentsOf(reqs, 'a')).toEqual(['b']);
  });
});
