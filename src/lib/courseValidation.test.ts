import { describe, expect, it } from 'vitest';
import type { Course, Requirement } from '../types/domain';
import { cleanRequirements, validateCourseDraft, type CourseDraft } from './courseValidation';
import { filterCourses, groupByTerm, EMPTY_FILTERS } from './pensumView';
import { computeAcademicState } from './engine/academic';

const course = (id: string, code: string, termId: string | null = null, sortOrder = 0): Course => ({
  id, programId: 'p', termId, code, name: `Curso ${code}`, credits: 3, area: null, description: null, sortOrder, isDemo: false,
});
const courses = [course('a', 'MAT101'), course('b', 'MAT102')];
const requirements: Record<string, Requirement[]> = { b: [{ type: 'courses', mode: 'all', courseIds: ['a'] }] };
const draft = (over: Partial<CourseDraft>): CourseDraft => ({
  code: 'NEW1', name: 'Nuevo', credits: '3', termId: '', area: '', description: '', sortOrder: 0, requirements: [], ...over,
});

describe('validateCourseDraft', () => {
  it('acepta un curso válido, incluso con 0 créditos', () => {
    expect(validateCourseDraft(draft({ credits: '0' }), { courses, requirements })).toEqual({});
  });

  it('rechaza códigos duplicados sin distinguir mayúsculas, salvo el propio curso', () => {
    expect(validateCourseDraft(draft({ code: 'mat101' }), { courses, requirements }).code).toMatch(/Ya existe/);
    expect(validateCourseDraft(draft({ id: 'a', code: 'MAT101' }), { courses, requirements }).code).toBeUndefined();
  });

  it('valida campos obligatorios y créditos', () => {
    const e = validateCourseDraft(draft({ code: '', name: ' ', credits: '-2' }), { courses, requirements });
    expect(Object.keys(e).sort()).toEqual(['code', 'credits', 'name']);
    expect(validateCourseDraft(draft({ code: 'CON ESPACIO' }), { courses, requirements }).code).toBeDefined();
  });

  it('detecta el ciclo antes de guardar y lo describe con códigos', () => {
    const e = validateCourseDraft(draft({ id: 'a', code: 'MAT101', requirements: [{ type: 'courses', mode: 'all', courseIds: ['b'] }] }), { courses, requirements });
    expect(e.requirements).toBe('Dependencia circular: MAT101 → MAT102 → MAT101.');
  });

  it('exige créditos mínimos positivos', () => {
    expect(validateCourseDraft(draft({ requirements: [{ type: 'credits', minCredits: NaN }] }), { courses, requirements }).requirements).toBeDefined();
  });

  it('cleanRequirements quita grupos vacíos y duplicados', () => {
    expect(
      cleanRequirements([
        { type: 'courses', mode: 'all', courseIds: [] },
        { type: 'courses', mode: 'any', courseIds: ['a', 'a', 'b'] },
      ]),
    ).toEqual([{ type: 'courses', mode: 'any', courseIds: ['a', 'b'] }]);
  });
});

describe('vista del pensum', () => {
  const terms = [
    { id: 't2', programId: 'p', name: 'Ciclo 2', yearNumber: null, sortOrder: 20, isDemo: false },
    { id: 't1', programId: 'p', name: 'Ciclo 1', yearNumber: null, sortOrder: 10, isDemo: false },
  ];
  const list = [course('x', 'B2', 't2', 10), course('y', 'A1', 't1', 20), course('z', 'A0', 't1', 10), course('w', 'S0', null)];

  it('agrupa por ciclo en orden configurado y deja «sin asignar» al final', () => {
    const sections = groupByTerm(terms, list);
    expect(sections.map((s) => s.term?.id ?? null)).toEqual(['t1', 't2', null]);
    expect(sections[0]!.courses.map((c) => c.code)).toEqual(['A0', 'A1']);
  });

  it('filtra por texto (sin tildes), estado y disponibilidad', () => {
    const named = [{ ...list[0]!, name: 'Matemática' }, ...list.slice(1)];
    const academic = computeAcademicState(named, { y: [{ type: 'courses', mode: 'all', courseIds: ['z'] }] }, { x: 'approved' });
    expect(filterCourses(named, academic, { ...EMPTY_FILTERS, search: 'matematica' }).map((c) => c.id)).toEqual(['x']);
    expect(filterCourses(named, academic, { ...EMPTY_FILTERS, status: 'approved' }).map((c) => c.id)).toEqual(['x']);
    expect(filterCourses(named, academic, { ...EMPTY_FILTERS, availability: 'blocked' }).map((c) => c.id)).toEqual(['y']);
  });
});
