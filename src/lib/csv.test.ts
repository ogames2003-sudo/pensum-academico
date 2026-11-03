import { describe, expect, it } from 'vitest';
import type { Course, Requirement, Term } from '../types/domain';
import { exportCoursesCsv, parseCsv, parseRequirementText, planImport } from './csv';

const term = (id: string, name: string, sortOrder: number): Term => ({
  id,
  programId: 'p',
  name,
  yearNumber: 1,
  sortOrder,
  isDemo: false,
});
const course = (id: string, code: string, termId: string | null, credits = 3): Course => ({
  id,
  programId: 'p',
  termId,
  code,
  name: `Nombre ${code}`,
  credits,
  area: null,
  description: null,
  sortOrder: 10,
  isDemo: false,
});
const empty = { courses: [], terms: [], requirements: {} };

describe('parseCsv', () => {
  it('respeta comillas, comillas escapadas y saltos de línea dentro de celdas', () => {
    expect(parseCsv('a,b\r\n"x, y","di ""hola""\nadiós"\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'di "hola"\nadiós'],
    ]);
  });

  it('detecta «;» como separador y quita el BOM', () => {
    expect(parseCsv('﻿codigo;nombre\nA1;Uno')).toEqual([
      ['codigo', 'nombre'],
      ['A1', 'Uno'],
    ]);
  });

  it('ignora filas vacías', () => {
    expect(parseCsv('a\n\n\nb\n')).toEqual([['a'], ['b']]);
  });
});

describe('parseRequirementText', () => {
  it('interpreta grupos «todos» y «uno de»', () => {
    expect(parseRequirementText('mat101; fis101 | uno:QUI101;BIO101')).toEqual([
      { mode: 'all', codes: ['MAT101', 'FIS101'] },
      { mode: 'any', codes: ['QUI101', 'BIO101'] },
    ]);
    expect(parseRequirementText('')).toEqual([]);
  });
});

describe('planImport', () => {
  it('acepta un archivo válido y crea los ciclos que faltan', () => {
    const csv = [
      'Código,Nombre,Créditos,Ciclo,prerrequisitos,creditos_minimos',
      'MAT101,Matemática I,4,Semestre 1,,',
      'MAT102,Matemática II,4,Semestre 2,MAT101,',
      'PRO300,Programación Avanzada,5,Semestre 2,MAT102,30',
    ].join('\n');
    const plan = planImport(csv, empty);
    expect(plan.errors).toEqual([]);
    expect(plan.courses).toHaveLength(3);
    expect(plan.newTermNames).toEqual(['Semestre 1', 'Semestre 2']);
    expect(plan.toCreate).toBe(3);
    expect(plan.courses[2]!.requirements).toEqual({ groups: [{ mode: 'all', codes: ['MAT102'] }], minCredits: 30 });
  });

  it('rechaza columnas obligatorias ausentes', () => {
    const plan = planImport('codigo,nombre\nA,B', empty);
    expect(plan.errors[0]!.message).toContain('creditos');
    expect(plan.courses).toEqual([]);
  });

  it('informa cada error con su número de fila', () => {
    const csv = ['codigo,nombre,creditos', 'A1,Uno,3', 'A1,Duplicado,3', ',Sin código,2', 'B1,,x', 'C1,Negativo,-1'].join('\n');
    const plan = planImport(csv, empty);
    const rows = plan.errors.map((e) => e.row);
    expect(rows).toEqual(expect.arrayContaining([3, 4, 5, 6]));
    expect(plan.errors.find((e) => e.row === 3)!.message).toContain('repetido');
    expect(plan.errors.filter((e) => e.row === 5)).toHaveLength(2); // nombre y créditos
  });

  it('acepta 0 créditos y decimales con coma', () => {
    const plan = planImport('codigo;nombre;creditos\nX1;Seminario;0\nX2;Taller;"1,5"', empty);
    expect(plan.errors).toEqual([]);
    expect(plan.courses.map((c) => c.credits)).toEqual([0, 1.5]);
  });

  it('rechaza prerrequisitos inexistentes y auto-referencias', () => {
    const csv = ['codigo,nombre,creditos,prerrequisitos', 'A1,Uno,3,ZZZ', 'B1,Dos,3,B1'].join('\n');
    const msgs = planImport(csv, empty).errors.map((e) => e.message);
    expect(msgs.some((m) => m.includes('ZZZ'))).toBe(true);
    expect(msgs.some((m) => m.includes('sí mismo'))).toBe(true);
  });

  it('acepta prerrequisitos que ya existen en el pensum', () => {
    const existing = { courses: [course('1', 'BASE1', null)], terms: [], requirements: {} };
    const plan = planImport('codigo,nombre,creditos,prerrequisitos\nN1,Nuevo,3,base1', existing);
    expect(plan.errors).toEqual([]);
  });

  it('detecta ciclos dentro del archivo', () => {
    const csv = ['codigo,nombre,creditos,prerrequisitos', 'A,Uno,3,C', 'B,Dos,3,A', 'C,Tres,3,B'].join('\n');
    const plan = planImport(csv, empty);
    expect(plan.errors).toHaveLength(1);
    expect(plan.errors[0]!.message).toContain('Dependencia circular');
  });

  it('detecta ciclos combinando el archivo con los requisitos existentes', () => {
    const existing = {
      courses: [course('1', 'A', null), course('2', 'B', null)],
      terms: [],
      requirements: { '2': [{ type: 'courses', mode: 'all', courseIds: ['1'] }] } as Record<string, Requirement[]>,
    };
    const plan = planImport('codigo,nombre,creditos,prerrequisitos\nA,Uno,3,B', existing);
    expect(plan.errors[0]!.message).toContain('Dependencia circular');
  });

  it('sin columnas de requisitos conserva los actuales y cuenta actualizaciones', () => {
    const existing = { courses: [course('1', 'A', null)], terms: [term('t', 'Ciclo 1', 1)], requirements: {} };
    const plan = planImport('codigo,nombre,creditos,ciclo\nA,Renombrado,5,ciclo 1\nB,Nuevo,2,', existing);
    expect(plan.errors).toEqual([]);
    expect(plan.courses[0]!.requirements).toBeNull();
    expect(plan.toUpdate).toBe(1);
    expect(plan.toCreate).toBe(1);
    expect(plan.newTermNames).toEqual([]); // «ciclo 1» coincide sin distinguir mayúsculas
  });
});

describe('exportación ⇄ importación', () => {
  it('el CSV exportado vuelve a importarse sin pérdida', () => {
    const terms = [term('t1', 'Ciclo 1', 1), term('t2', 'Ciclo 2', 2)];
    const courses = [
      { ...course('1', 'A', 't1'), description: 'Con "comillas", y comas' },
      course('2', 'B', 't1'),
      course('3', 'C', 't2', 0),
    ];
    const requirements: Record<string, Requirement[]> = {
      '3': [
        { type: 'courses', mode: 'any', courseIds: ['1', '2'] },
        { type: 'credits', minCredits: 6 },
      ],
    };
    const csv = exportCoursesCsv(courses, terms, requirements);
    const plan = planImport(csv, { courses, terms, requirements });
    expect(plan.errors).toEqual([]);
    expect(plan.toUpdate).toBe(3);
    const c = plan.courses.find((x) => x.code === 'C')!;
    expect(c.credits).toBe(0);
    expect(c.termName).toBe('Ciclo 2');
    expect(c.requirements).toEqual({ groups: [{ mode: 'any', codes: ['A', 'B'] }], minCredits: 6 });
    expect(plan.courses.find((x) => x.code === 'A')!.description).toBe('Con "comillas", y comas');
  });
});
