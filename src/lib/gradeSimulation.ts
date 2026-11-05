import type { Course, ProgressMap, Term } from '../types/domain';
import { evaluationStatus, PASSING_SCORE, totalScore, zoneScore, type Grades } from './engine/grades';
import { isApproved } from './engine/credits';
import type { GradesMap } from './engine/academic';

/**
 * Calificaciones FICTICIAS para probar la interfaz. Solo se generan cuando el administrador lo pide,
 * se previsualizan y se guardan tras confirmar. Enteros; con semilla, el resultado es reproducible.
 */

// ───────────────────────── Aleatoriedad reproducible ─────────────────────────

export type Rng = () => number;

/** mulberry32: generador pequeño y determinista a partir de una semilla entera. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randomSeed = () => Math.floor(Math.random() * 1_000_000);
const randInt = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

/** Ajusta valores de a ±1 en posiciones aleatorias, dentro de [lo, hi], hasta que sumen `target`. */
export function fixSum(values: number[], lo: number, hi: number, target: number, rng: Rng): number[] {
  if (target < values.length * lo || target > values.length * hi) throw new Error('Suma objetivo imposible con esos límites.');
  const v = values.map((x) => Math.min(hi, Math.max(lo, x)));
  let sum = v.reduce((a, b) => a + b, 0);
  while (sum !== target) {
    const i = Math.floor(rng() * v.length);
    if (sum < target && v[i]! < hi) {
      v[i]!++;
      sum++;
    } else if (sum > target && v[i]! > lo) {
      v[i]!--;
      sum--;
    }
  }
  return v;
}

/** Reparte `s` (0–60) en E, E1, E2, cada uno 0–20, con variación aleatoria. */
export function splitZone(s: number, rng: Rng): [number, number, number] {
  if (s < 0 || s > 60) throw new Error('E + E1 + E2 debe estar entre 0 y 60.');
  const parts = [Math.floor(s / 3), Math.floor(s / 3), Math.floor(s / 3)];
  for (let r = s - parts[0]! * 3, i = 0; r > 0; r--, i++) parts[i % 3]!++;
  for (let k = 0; k < 6; k++) {
    const from = Math.floor(rng() * 3);
    const to = Math.floor(rng() * 3);
    const d = randInt(rng, 1, 3);
    if (from !== to && parts[from]! - d >= 0 && parts[to]! + d <= 20) {
      parts[from]! -= d;
      parts[to]! += d;
    }
  }
  return [parts[0]!, parts[1]!, parts[2]!];
}

const make = (attendance: number, e: [number, number, number], finalExam: number | null): Grades => ({
  attendance,
  exercises: e[0],
  partial1: e[1],
  partial2: e[2],
  finalExam,
});

// ───────────────────────── Escenarios ─────────────────────────

export const APPROVED_TARGET_TOTAL_AVG = 75;
export const APPROVED_TARGET_EF_AVG = 25;

/**
 * n cursos aprobados con A = 10, promedio total exacto 75 y promedio EF exacto 25 (zona promedio 50),
 * cada total entre 61 y 100. Se fijan las sumas primero y se redistribuye sin romper los límites.
 */
export function generateApprovedGroup(n: number, rng: Rng): Grades[] {
  const efSum = n * APPROVED_TARGET_EF_AVG;
  const sSum = n * (APPROVED_TARGET_TOTAL_AVG - APPROVED_TARGET_EF_AVG - 10); // E + E1 + E2
  const ef = fixSum(Array.from({ length: n }, () => randInt(rng, 18, 30)), 12, 30, efSum, rng);
  const s = fixSum(Array.from({ length: n }, () => randInt(rng, 28, 52)), 20, 60, sSum, rng);

  // Ningún total por debajo de 61: se pasa un punto de E+E1+E2 (o de EF) desde el curso con más margen.
  const total = (i: number) => 10 + s[i]! + ef[i]!;
  for (let guard = 0; guard < 10_000; guard++) {
    const low = s.findIndex((_, i) => total(i) < PASSING_SCORE);
    if (low === -1) break;
    let donor = -1;
    for (let j = 0; j < n; j++) if (total(j) > PASSING_SCORE && (donor === -1 || total(j) > total(donor))) donor = j;
    if (donor === -1) throw new Error('No hay margen para que todos superen 61.');
    if (s[donor]! > 20 && s[low]! < 60) {
      s[donor]!--;
      s[low]!++;
    } else if (ef[donor]! > 12 && ef[low]! < 30) {
      ef[donor]!--;
      ef[low]!++;
    } else throw new Error('No se pudo redistribuir dentro de los límites.');
  }
  return s.map((si, i) => make(10, splitZone(si, rng), ef[i]!));
}

/** Preaprobados: A = 10, zona 61–70 (E + E1 + E2 entre 51 y 60), EF sin registrar. */
export const generatePreapproved = (n: number, rng: Rng): Grades[] =>
  Array.from({ length: n }, () => make(10, splitZone(randInt(rng, 51, 60), rng), null));

/** En curso: A = 10, zona 35–60 (E + E1 + E2 entre 25 y 50), EF sin registrar. */
export const generateInProgress = (n: number, rng: Rng): Grades[] =>
  Array.from({ length: n }, () => make(10, splitZone(randInt(rng, 25, 50), rng), null));

// ───────────────────────── Validación ─────────────────────────

export interface SimulationResult {
  approved: Grades[];
  preapproved: Grades[];
  inProgress: Grades[];
}

export function validateSimulation(r: SimulationResult): string[] {
  const issues: string[] = [];
  const bounds = (g: Grades) =>
    g.attendance! <= 10 && [g.exercises, g.partial1, g.partial2].every((x) => x !== null && x >= 0 && x <= 20) && (g.finalExam === null || (g.finalExam >= 0 && g.finalExam <= 30));
  const all = [...r.approved, ...r.preapproved, ...r.inProgress];
  if (!all.every(bounds)) issues.push('Hay notas fuera de los máximos permitidos.');
  if (!all.every((g) => g.attendance === 10)) issues.push('La asistencia debe ser 10 en todos los cursos generados.');
  if (r.approved.length) {
    const totals = r.approved.map((g) => totalScore(g)!);
    const efs = r.approved.map((g) => g.finalExam!);
    if (totals.some((t) => t < PASSING_SCORE || t > 100)) issues.push('Algún curso aprobado quedó fuera de 61–100.');
    if (totals.reduce((a, b) => a + b, 0) !== r.approved.length * APPROVED_TARGET_TOTAL_AVG) issues.push('El promedio total no es exactamente 75.');
    if (efs.reduce((a, b) => a + b, 0) !== r.approved.length * APPROVED_TARGET_EF_AVG) issues.push('El promedio de EF no es exactamente 25.');
    if (!r.approved.every((g) => evaluationStatus(g) === 'approved')) issues.push('Algún curso del grupo no quedó aprobado.');
  }
  if (!r.preapproved.every((g) => g.finalExam === null && zoneScore(g)! >= 61 && zoneScore(g)! <= 70)) issues.push('Los preaprobados deben tener zona 61–70 y EF pendiente.');
  if (!r.inProgress.every((g) => g.finalExam === null && zoneScore(g)! <= 60)) issues.push('Los cursos en curso deben tener zona ≤ 60 y EF pendiente.');
  return issues;
}

// ───────────────────────── Selección de cursos reales ─────────────────────────

export interface SimulationParts {
  approved: boolean;
  preapproved: boolean;
  inProgress: boolean;
}

export interface SimulationPlan {
  approved: Course[];
  preapproved: Course[];
  inProgress: Course[];
  /** Diferencias entre lo esperado por el escenario y los datos reales (se muestran antes de guardar). */
  discrepancies: string[];
  /** Cursos del plan que ya tienen calificaciones (se sobrescribirían). */
  overwrites: Course[];
  /** Cursos de ciclos posteriores al 8.º: nunca se tocan. */
  untouchedLater: Course[];
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const APPROVED_GROUP_SIZE = 35;
const PREAPPROVED_NAMES = ['desarrollo web', 'etica profesional'];

/** Identifica los cursos reales del escenario por orden del pensum (ciclo y posición) y por nombre. */
export function planSimulation(
  courses: Course[],
  terms: Term[],
  effective: ProgressMap,
  grades: GradesMap,
  parts: SimulationParts,
): SimulationPlan {
  const sortedTerms = [...terms].sort((a, b) => a.sortOrder - b.sortOrder);
  const termIndex = new Map(sortedTerms.map((t, i) => [t.id, i]));
  const ordered = [...courses].sort(
    (a, b) => (termIndex.get(a.termId ?? '') ?? 999) - (termIndex.get(b.termId ?? '') ?? 999) || a.sortOrder - b.sortOrder,
  );
  const eighth = sortedTerms[7];
  const inEighth = (c: Course) => !!eighth && c.termId === eighth.id;
  const afterEighth = (c: Course) => (termIndex.get(c.termId ?? '') ?? -1) > 7;
  const discrepancies: string[] = [];

  const approved = parts.approved
    ? ordered.filter((c) => isApproved(effective, c.id) && !inEighth(c) && !afterEighth(c)).slice(0, APPROVED_GROUP_SIZE)
    : [];
  if (parts.approved && approved.length < APPROVED_GROUP_SIZE) {
    discrepancies.push(`Solo hay ${approved.length} cursos aprobados antes del 8.º ciclo (se esperaban ${APPROVED_GROUP_SIZE}). Se generará para esos ${approved.length}; los promedios objetivo se mantienen.`);
  }

  const eighthCourses = eighth ? ordered.filter(inEighth) : [];
  if ((parts.preapproved || parts.inProgress) && !eighth) discrepancies.push('No existe un 8.º ciclo en el pensum.');
  if (eighth && eighthCourses.length !== 5) discrepancies.push(`El 8.º ciclo («${eighth.name}») tiene ${eighthCourses.length} cursos (se esperaban 5).`);

  const preapprovedAll = PREAPPROVED_NAMES.map((n) => eighthCourses.find((c) => fold(c.name) === n));
  PREAPPROVED_NAMES.forEach((n, i) => {
    if ((parts.preapproved || parts.inProgress) && eighth && !preapprovedAll[i]) discrepancies.push(`No se encontró «${n}» en el 8.º ciclo.`);
  });
  const preapprovedFound = preapprovedAll.filter((c): c is Course => !!c);
  const preapproved = parts.preapproved ? preapprovedFound : [];
  const inProgress = parts.inProgress ? eighthCourses.filter((c) => !preapprovedFound.includes(c)) : [];

  for (const c of preapproved) {
    if (isApproved(effective, c.id)) {
      discrepancies.push(`${c.code} ${c.name} está APROBADO hoy: pasará a Preaprobado (provisional) y dejará de sumar ${c.credits} créditos hasta registrar el examen final.`);
    }
  }
  for (const c of inProgress) {
    if (isApproved(effective, c.id)) {
      discrepancies.push(`${c.code} ${c.name} está APROBADO hoy (el escenario lo supone pendiente): pasará a En curso y dejará de sumar ${c.credits} créditos.`);
    }
  }

  const targets = [...approved, ...preapproved, ...inProgress];
  const overwrites = targets.filter((c) => {
    const g = grades[c.id];
    return !!g && evaluationStatus(g) !== 'pending';
  });
  return { approved, preapproved, inProgress, discrepancies, overwrites, untouchedLater: ordered.filter(afterEighth) };
}

/** Genera las notas del plan. Lanza si no cumple las restricciones (no se debe guardar). */
export function runSimulation(plan: SimulationPlan, seed: number): { result: SimulationResult; byCourse: GradesMap; issues: string[] } {
  const rng = seededRng(seed);
  const result: SimulationResult = {
    approved: plan.approved.length ? generateApprovedGroup(plan.approved.length, rng) : [],
    preapproved: generatePreapproved(plan.preapproved.length, rng),
    inProgress: generateInProgress(plan.inProgress.length, rng),
  };
  const byCourse: GradesMap = {};
  plan.approved.forEach((c, i) => (byCourse[c.id] = result.approved[i]!));
  plan.preapproved.forEach((c, i) => (byCourse[c.id] = result.preapproved[i]!));
  plan.inProgress.forEach((c, i) => (byCourse[c.id] = result.inProgress[i]!));
  return { result, byCourse, issues: validateSimulation(result) };
}
