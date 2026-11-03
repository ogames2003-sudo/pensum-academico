import type { Course, Requirement, Term } from '../types/domain';
import { findCycle, type DependencyGraph } from './engine/graph';

/**
 * Formato CSV de cursos (una fila por curso):
 *   codigo, nombre, creditos, ciclo, anio, area, orden, descripcion, prerrequisitos, creditos_minimos
 *
 * `prerrequisitos`: grupos separados por «|»; cada grupo, códigos separados por «;».
 * Un grupo con prefijo «uno:» exige al menos uno de sus cursos; sin prefijo, todos.
 *   Ej.: «MAT101;FIS101|uno:QUI101;BIO101»
 * Si las columnas prerrequisitos/creditos_minimos no existen en el archivo, los requisitos actuales se conservan.
 */
export const CSV_COLUMNS = [
  'codigo',
  'nombre',
  'creditos',
  'ciclo',
  'anio',
  'area',
  'orden',
  'descripcion',
  'prerrequisitos',
  'creditos_minimos',
] as const;

const REQUIRED_COLUMNS = ['codigo', 'nombre', 'creditos'] as const;
const ANY_PREFIX = /^(uno|any)\s*:/i;
export const MAX_CODE_LENGTH = 30;
export const MAX_NAME_LENGTH = 160;

// ───────────────────────── Parseo / serialización RFC 4180 ─────────────────────────

/** Detecta «,» o «;» según cuál aparezca más en la cabecera fuera de comillas. */
function detectDelimiter(text: string): ',' | ';' {
  let commas = 0;
  let semis = 0;
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === '\n' || ch === '\r')) break;
    else if (!quoted && ch === ',') commas++;
    else if (!quoted && ch === ';') semis++;
  }
  return semis > commas ? ';' : ',';
}

export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const delim = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

const escapeCell = (v: string) => (/[",;\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(escapeCell).join(',')).join('\r\n') + '\r\n';
}

// ───────────────────────── Requisitos ⇄ texto ─────────────────────────

export interface CodeRequirementGroup {
  mode: 'all' | 'any';
  codes: string[];
}

export function parseRequirementText(text: string): CodeRequirementGroup[] {
  return text
    .split('|')
    .map((g) => g.trim())
    .filter(Boolean)
    .map((g) => {
      const mode: 'all' | 'any' = ANY_PREFIX.test(g) ? 'any' : 'all';
      const codes = g
        .replace(ANY_PREFIX, '')
        .split(';')
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean);
      return { mode, codes: [...new Set(codes)] };
    })
    .filter((g) => g.codes.length > 0);
}

export function formatRequirementText(reqs: Requirement[], codeById: Map<string, string>): string {
  return reqs
    .filter((r): r is Extract<Requirement, { type: 'courses' }> => r.type === 'courses' && r.courseIds.length > 0)
    .map((r) => {
      const codes = r.courseIds.map((id) => codeById.get(id)).filter(Boolean).join(';');
      return r.mode === 'any' ? `uno:${codes}` : codes;
    })
    .join('|');
}

// ───────────────────────── Exportación ─────────────────────────

export function exportCoursesCsv(courses: Course[], terms: Term[], requirements: Record<string, Requirement[]>): string {
  const termById = new Map(terms.map((t) => [t.id, t]));
  const codeById = new Map(courses.map((c) => [c.id, c.code]));
  const termOrder = (c: Course) => (c.termId ? (termById.get(c.termId)?.sortOrder ?? 1e9) : 1e9);
  const sorted = [...courses].sort((a, b) => termOrder(a) - termOrder(b) || a.sortOrder - b.sortOrder);
  const rows = sorted.map((c) => {
    const term = c.termId ? termById.get(c.termId) : undefined;
    const reqs = requirements[c.id] ?? [];
    const credit = reqs.find((r) => r.type === 'credits');
    return [
      c.code,
      c.name,
      String(c.credits),
      term?.name ?? '',
      term?.yearNumber != null ? String(term.yearNumber) : '',
      c.area ?? '',
      String(c.sortOrder),
      c.description ?? '',
      formatRequirementText(reqs, codeById),
      credit && credit.type === 'credits' ? String(credit.minCredits) : '',
    ];
  });
  return toCsv([[...CSV_COLUMNS], ...rows]);
}

// ───────────────────────── Importación validada ─────────────────────────

export interface ImportCourse {
  code: string;
  name: string;
  credits: number;
  termName: string | null;
  yearNumber: number | null;
  area: string | null;
  sortOrder: number;
  description: string | null;
  /** null = conservar los requisitos actuales del curso. */
  requirements: { groups: CodeRequirementGroup[]; minCredits: number | null } | null;
}

export interface ImportIssue {
  /** Número de fila en el archivo (la cabecera es la fila 1). 0 = problema general. */
  row: number;
  message: string;
}

export interface ImportPlan {
  courses: ImportCourse[];
  newTermNames: string[];
  toCreate: number;
  toUpdate: number;
  errors: ImportIssue[];
}

function parseNumber(raw: string): number | null {
  const v = raw.trim().replace(',', '.');
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Valida el CSV contra el pensum existente sin tocar nada.
 * Solo si `errors` está vacío se debe ejecutar la importación.
 */
export function planImport(
  csvText: string,
  existing: { courses: Course[]; terms: Term[]; requirements: Record<string, Requirement[]> },
): ImportPlan {
  const errors: ImportIssue[] = [];
  const empty: ImportPlan = { courses: [], newTermNames: [], toCreate: 0, toUpdate: 0, errors };
  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    errors.push({ row: 0, message: 'El archivo está vacío.' });
    return empty;
  }

  const header = rows[0]!.map((h) => h.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
  const col = (name: string) => header.indexOf(name);
  for (const req of REQUIRED_COLUMNS) {
    if (col(req) === -1) errors.push({ row: 1, message: `Falta la columna obligatoria «${req}».` });
  }
  if (errors.length) return empty;
  if (rows.length === 1) {
    errors.push({ row: 0, message: 'El archivo no contiene cursos (solo la cabecera).' });
    return empty;
  }
  const hasReqColumns = col('prerrequisitos') !== -1 || col('creditos_minimos') !== -1;

  const courses: ImportCourse[] = [];
  const seen = new Map<string, number>();
  rows.slice(1).forEach((cells, i) => {
    const rowNum = i + 2;
    const get = (name: string) => {
      const idx = col(name);
      return idx === -1 ? '' : (cells[idx] ?? '').trim();
    };
    const code = get('codigo').toUpperCase();
    const name = get('nombre');
    const credits = parseNumber(get('creditos'));
    const year = parseNumber(get('anio'));
    const order = parseNumber(get('orden'));
    const minCredits = parseNumber(get('creditos_minimos'));
    const rowErrors: string[] = [];

    if (!code) rowErrors.push('el código es obligatorio');
    else if (code.length > MAX_CODE_LENGTH) rowErrors.push(`el código supera ${MAX_CODE_LENGTH} caracteres`);
    else if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(code)) rowErrors.push(`código «${code}» inválido (use letras, números, «-», «_» o «.»)`);
    else if (seen.has(code)) rowErrors.push(`código «${code}» repetido (también en la fila ${seen.get(code)})`);
    if (!name) rowErrors.push('el nombre es obligatorio');
    else if (name.length > MAX_NAME_LENGTH) rowErrors.push(`el nombre supera ${MAX_NAME_LENGTH} caracteres`);
    if (credits === null) rowErrors.push('los créditos son obligatorios (puede ser 0)');
    else if (Number.isNaN(credits) || credits < 0 || credits > 999) rowErrors.push('créditos inválidos (número entre 0 y 999)');
    if (year !== null && (Number.isNaN(year) || !Number.isInteger(year) || year < 1 || year > 20)) rowErrors.push('año inválido (entero de 1 a 20)');
    if (order !== null && (Number.isNaN(order) || !Number.isInteger(order))) rowErrors.push('orden inválido (número entero)');
    if (minCredits !== null && (Number.isNaN(minCredits) || minCredits < 0)) rowErrors.push('créditos mínimos inválidos');

    if (code) seen.set(code, rowNum);
    rowErrors.forEach((message) => errors.push({ row: rowNum, message: message[0]!.toUpperCase() + message.slice(1) + '.' }));
    if (rowErrors.length) return;

    const termName = get('ciclo') || null;
    courses.push({
      code,
      name,
      credits: credits!,
      termName,
      yearNumber: year,
      area: get('area') || null,
      sortOrder: order ?? (i + 1) * 10,
      description: get('descripcion') || null,
      requirements: hasReqColumns
        ? { groups: parseRequirementText(get('prerrequisitos')), minCredits: minCredits && minCredits > 0 ? minCredits : null }
        : null,
    });
  });

  // Referencias de prerrequisitos: deben existir en el archivo o en el pensum actual.
  const existingCodes = new Set(existing.courses.map((c) => c.code.toUpperCase()));
  const fileCodes = new Set(courses.map((c) => c.code));
  courses.forEach((c) => {
    const rowNum = seen.get(c.code)!;
    for (const g of c.requirements?.groups ?? []) {
      for (const ref of g.codes) {
        if (ref === c.code) errors.push({ row: rowNum, message: `${c.code} no puede requerirse a sí mismo.` });
        else if (!fileCodes.has(ref) && !existingCodes.has(ref)) {
          errors.push({ row: rowNum, message: `El prerrequisito «${ref}» no existe ni en el archivo ni en el pensum.` });
        }
      }
    }
  });

  // Dependencias circulares sobre el grafo resultante (actual + archivo).
  if (errors.length === 0) {
    const codeById = new Map(existing.courses.map((c) => [c.id, c.code.toUpperCase()]));
    const graph: DependencyGraph = new Map();
    for (const c of existing.courses) {
      const deps = new Set<string>();
      for (const r of existing.requirements[c.id] ?? []) {
        if (r.type === 'courses') r.courseIds.forEach((id) => codeById.has(id) && deps.add(codeById.get(id)!));
      }
      graph.set(c.code.toUpperCase(), deps);
    }
    for (const c of courses) {
      if (c.requirements) graph.set(c.code, new Set(c.requirements.groups.flatMap((g) => g.codes)));
      else if (!graph.has(c.code)) graph.set(c.code, new Set());
    }
    const cycle = findCycle(graph);
    if (cycle) errors.push({ row: 0, message: `Dependencia circular: ${cycle.join(' → ')}.` });
  }

  const existingTermNames = new Set(existing.terms.map((t) => t.name.trim().toLowerCase()));
  const newTermNames = [
    ...new Map(
      courses
        .map((c) => c.termName)
        .filter((n): n is string => !!n && !existingTermNames.has(n.toLowerCase()))
        .map((n) => [n.toLowerCase(), n] as const),
    ).values(),
  ];
  const toUpdate = courses.filter((c) => existingCodes.has(c.code)).length;

  return { courses, newTermNames, toCreate: courses.length - toUpdate, toUpdate, errors };
}
