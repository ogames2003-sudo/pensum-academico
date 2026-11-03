import type {
  AccentColor,
  Course,
  OrganizationType,
  PensumData,
  Program,
  ProgressMap,
  ProgressStatus,
  Requirement,
  Term,
} from '../types/domain';
import type { ImportCourse } from '../lib/csv';
import { PROGRAM_SLUG, requireSupabase } from './supabase';

// ───────────────────────── Filas ⇄ dominio ─────────────────────────

interface ProgramRow {
  id: string;
  slug: string;
  name: string;
  institution: string | null;
  organization_type: OrganizationType;
  accent_color: AccentColor;
  is_public: boolean;
  show_progress_public: boolean;
  student_id: string | null;
}
interface TermRow {
  id: string;
  program_id: string;
  name: string;
  year_number: number | null;
  sort_order: number;
  is_demo: boolean;
}
interface CourseRow {
  id: string;
  program_id: string;
  term_id: string | null;
  code: string;
  name: string;
  credits: number | string;
  area: string | null;
  description: string | null;
  sort_order: number;
  is_demo: boolean;
}
interface RequirementRow {
  id: string;
  course_id: string;
  type: 'courses' | 'credits';
  mode: 'all' | 'any' | null;
  min_credits: number | string | null;
  sort_order: number;
  requirement_courses: { required_course_id: string }[];
}

const toProgram = (r: ProgramRow): Program => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  institution: r.institution,
  organizationType: r.organization_type,
  accentColor: r.accent_color,
  isPublic: r.is_public,
  showProgressPublic: r.show_progress_public,
  studentId: r.student_id,
});
const toTerm = (r: TermRow): Term => ({
  id: r.id,
  programId: r.program_id,
  name: r.name,
  yearNumber: r.year_number,
  sortOrder: r.sort_order,
  isDemo: r.is_demo,
});
// numeric llega como string desde PostgREST.
const toCourse = (r: CourseRow): Course => ({
  id: r.id,
  programId: r.program_id,
  termId: r.term_id,
  code: r.code,
  name: r.name,
  credits: Number(r.credits),
  area: r.area,
  description: r.description,
  sortOrder: r.sort_order,
  isDemo: r.is_demo,
});
const toRequirement = (r: RequirementRow): Requirement =>
  r.type === 'credits'
    ? { id: r.id, type: 'credits', minCredits: Number(r.min_credits) }
    : { id: r.id, type: 'courses', mode: r.mode ?? 'all', courseIds: r.requirement_courses.map((x) => x.required_course_id) };

const requirementsToJson = (reqs: Requirement[]) =>
  reqs.map((r) =>
    r.type === 'credits'
      ? { type: 'credits', min_credits: r.minCredits }
      : { type: 'courses', mode: r.mode, course_ids: r.courseIds },
  );

/** Lotes de ids para que los filtros `in` no generen URLs demasiado largas en pensums grandes. */
function chunk<T>(items: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const PROGRAM_COLUMNS ='id, slug, name, institution, organization_type, accent_color, is_public, show_progress_public, student_id';

// ───────────────────────── Lectura ─────────────────────────

/** Programa a mostrar: el del slug configurado, o el primero creado (visible según RLS). */
export async function fetchProgram(): Promise<Program | null> {
  const sb = requireSupabase();
  let q = sb.from('programs').select(PROGRAM_COLUMNS).order('created_at').limit(1);
  if (PROGRAM_SLUG) q = q.eq('slug', PROGRAM_SLUG);
  const { data, error } = await q;
  if (error) throw error;
  return data?.[0] ? toProgram(data[0] as ProgramRow) : null;
}

export async function fetchPensum(program: Program, opts: { isAdmin: boolean }): Promise<PensumData> {
  const sb = requireSupabase();
  const [terms, courses] = await Promise.all([
    sb.from('terms').select('*').eq('program_id', program.id).order('sort_order'),
    sb.from('courses').select('*').eq('program_id', program.id).order('sort_order'),
  ]);
  for (const r of [terms, courses]) if (r.error) throw r.error;
  const courseIds = ((courses.data ?? []) as CourseRow[]).map((c) => c.id);

  // Filtrar por ids de curso (no por un embed de `courses`): course_requirements se relaciona con courses
  // por dos caminos (directo y vía requirement_courses) y PostgREST rechaza el embed por ambiguo.
  const requirements: Record<string, Requirement[]> = {};
  for (const ids of chunk(courseIds)) {
    const { data, error } = await sb
      .from('course_requirements')
      .select('id, course_id, type, mode, min_credits, sort_order, requirement_courses(required_course_id)')
      .in('course_id', ids)
      .order('sort_order');
    if (error) throw error;
    for (const row of (data ?? []) as unknown as RequirementRow[]) {
      (requirements[row.course_id] ??= []).push(toRequirement(row));
    }
  }

  const progressVisible = opts.isAdmin || (program.isPublic && program.showProgressPublic);
  const progress: ProgressMap = {};
  if (progressVisible && program.studentId) {
    for (const ids of chunk(courseIds)) {
      const { data, error } = await sb
        .from('student_progress')
        .select('course_id, status')
        .eq('student_id', program.studentId)
        .in('course_id', ids);
      if (error) throw error;
      for (const p of data ?? []) if (p.status === 'approved') progress[p.course_id as string] = 'approved';
    }
  }

  return {
    program,
    terms: ((terms.data ?? []) as TermRow[]).map(toTerm),
    courses: ((courses.data ?? []) as CourseRow[]).map(toCourse),
    requirements,
    progress,
    progressVisible,
  };
}

// ───────────────────────── Programa ─────────────────────────

export interface ProgramInput {
  name: string;
  slug: string;
  institution: string | null;
  organizationType: OrganizationType;
  accentColor: AccentColor;
  isPublic: boolean;
  showProgressPublic: boolean;
}

const programToRow = (p: ProgramInput) => ({
  name: p.name.trim(),
  slug: p.slug,
  institution: p.institution?.trim() || null,
  organization_type: p.organizationType,
  accent_color: p.accentColor,
  is_public: p.isPublic,
  show_progress_public: p.showProgressPublic,
});

export async function createProgram(input: ProgramInput, studentId: string): Promise<Program> {
  const { data, error } = await requireSupabase()
    .from('programs')
    .insert({ ...programToRow(input), student_id: studentId })
    .select(PROGRAM_COLUMNS)
    .single();
  if (error) throw error;
  return toProgram(data as ProgramRow);
}

export async function updateProgram(id: string, input: ProgramInput): Promise<Program> {
  const { data, error } = await requireSupabase()
    .from('programs')
    .update(programToRow(input))
    .eq('id', id)
    .select(PROGRAM_COLUMNS)
    .single();
  if (error) throw error;
  return toProgram(data as ProgramRow);
}

// ───────────────────────── Ciclos ─────────────────────────

export interface TermInput {
  name: string;
  yearNumber: number | null;
}

export async function createTerm(programId: string, input: TermInput, sortOrder: number, isDemo = false): Promise<Term> {
  const { data, error } = await requireSupabase()
    .from('terms')
    .insert({ program_id: programId, name: input.name.trim(), year_number: input.yearNumber, sort_order: sortOrder, is_demo: isDemo })
    .select('*')
    .single();
  if (error) throw error;
  return toTerm(data as TermRow);
}

export async function updateTerm(id: string, input: TermInput): Promise<void> {
  const { error } = await requireSupabase()
    .from('terms')
    .update({ name: input.name.trim(), year_number: input.yearNumber })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteTerm(id: string): Promise<void> {
  const { error } = await requireSupabase().from('terms').delete().eq('id', id);
  if (error) throw error;
}

export async function reorder(table: 'courses' | 'terms', ids: string[]): Promise<void> {
  const { error } = await requireSupabase().rpc('reorder_items', { p_table: table, p_ids: ids });
  if (error) throw error;
}

// ───────────────────────── Cursos ─────────────────────────

export interface CourseInput {
  id?: string;
  termId: string | null;
  code: string;
  name: string;
  credits: number;
  area: string | null;
  description: string | null;
  sortOrder: number;
  isDemo?: boolean;
}

/** Guarda curso + requisitos en una transacción (RPC save_course). */
export async function saveCourse(programId: string, input: CourseInput, requirements: Requirement[]): Promise<string> {
  const { data, error } = await requireSupabase().rpc('save_course', {
    p_course: {
      id: input.id ?? null,
      program_id: programId,
      term_id: input.termId,
      code: input.code,
      name: input.name,
      credits: input.credits,
      area: input.area,
      description: input.description,
      sort_order: input.sortOrder,
      is_demo: input.isDemo ?? false,
    },
    p_requirements: requirementsToJson(requirements),
  });
  if (error) throw error;
  return data as string;
}

export async function deleteCourse(id: string): Promise<void> {
  const { error } = await requireSupabase().from('courses').delete().eq('id', id);
  if (error) throw error;
}

// ───────────────────────── Progreso ─────────────────────────

export async function setProgress(studentId: string, courseId: string, status: ProgressStatus): Promise<void> {
  const sb = requireSupabase();
  const { error } =
    status === 'approved'
      ? await sb
          .from('student_progress')
          .upsert({ student_id: studentId, course_id: courseId, status: 'approved' }, { onConflict: 'student_id,course_id' })
      : await sb.from('student_progress').delete().eq('student_id', studentId).eq('course_id', courseId);
  if (error) throw error;
}

// ───────────────────────── Importación / demo ─────────────────────────

export async function importCourses(programId: string, courses: ImportCourse[]): Promise<{ created: number; updated: number }> {
  const { data, error } = await requireSupabase().rpc('import_courses', {
    p_program_id: programId,
    p_payload: {
      courses: courses.map((c) => ({
        code: c.code,
        name: c.name,
        credits: c.credits,
        term_name: c.termName,
        year_number: c.yearNumber,
        area: c.area,
        sort_order: c.sortOrder,
        description: c.description,
        requirements: c.requirements ? { groups: c.requirements.groups, min_credits: c.requirements.minCredits } : null,
      })),
    },
  });
  if (error) throw error;
  return data as { created: number; updated: number };
}

/** Elimina solo los registros marcados como demostración (cursos y ciclos). */
export async function deleteDemoData(programId: string): Promise<void> {
  const sb = requireSupabase();
  const courses = await sb.from('courses').delete().eq('program_id', programId).eq('is_demo', true);
  if (courses.error) throw courses.error;
  const terms = await sb.from('terms').delete().eq('program_id', programId).eq('is_demo', true);
  if (terms.error) throw terms.error;
}
