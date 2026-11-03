import type { Course, Term } from '../types/domain';
import type { AcademicState } from './engine/academic';

export interface TermSection {
  term: Term | null; // null = «Sin ciclo asignado»
  courses: Course[];
}

/** Agrupa los cursos por ciclo en el orden configurado. Los cursos sin ciclo van al final. */
export function groupByTerm(terms: Term[], courses: Course[]): TermSection[] {
  const sortedTerms = [...terms].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const byTerm = new Map<string | null, Course[]>();
  for (const c of courses) {
    const key = c.termId && terms.some((t) => t.id === c.termId) ? c.termId : null;
    (byTerm.get(key) ?? byTerm.set(key, []).get(key)!).push(c);
  }
  const sortCourses = (list: Course[]) => list.sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
  const sections: TermSection[] = sortedTerms.map((t) => ({ term: t, courses: sortCourses(byTerm.get(t.id) ?? []) }));
  const loose = byTerm.get(null);
  if (loose?.length) sections.push({ term: null, courses: sortCourses(loose) });
  return sections;
}

export interface PensumFilters {
  search: string;
  termId: string; // '' = todos
  status: '' | 'approved' | 'pending';
  availability: '' | 'available' | 'blocked';
  area: string;
}

export const EMPTY_FILTERS: PensumFilters = { search: '', termId: '', status: '', availability: '', area: '' };

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filterCourses(courses: Course[], academic: AcademicState, f: PensumFilters): Course[] {
  const q = fold(f.search.trim());
  return courses.filter((c) => {
    const st = academic.byCourse.get(c.id);
    if (f.termId && (f.termId === '__none' ? c.termId !== null : c.termId !== f.termId)) return false;
    if (f.status && st?.status !== f.status) return false;
    if (f.availability && st?.availability !== f.availability) return false;
    if (f.area && c.area !== f.area) return false;
    if (q && !fold(`${c.code} ${c.name} ${c.area ?? ''}`).includes(q)) return false;
    return true;
  });
}

export const hasActiveFilters = (f: PensumFilters) => Object.values(f).some(Boolean);

export const areasOf = (courses: Course[]) =>
  [...new Set(courses.map((c) => c.area).filter((a): a is string => !!a))].sort((a, b) => a.localeCompare(b));

export const formatCredits = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''));
