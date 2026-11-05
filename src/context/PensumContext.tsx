import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Course, PensumData, ProgressStatus, Term } from '../types/domain';
import { computeAcademicState, setCourseStatus, type AcademicState } from '../lib/engine/academic';
import { deleteGrades, fetchPensum, fetchProgram, saveGrades, setProgress } from '../services/pensumService';
import { friendlyError, isSupabaseConfigured, supabase } from '../services/supabase';
import type { EvaluationStatus, Grades } from '../lib/engine/grades';
import { useToast } from '../components/ui/Toast';
import { applyAccent, applyFavicon } from '../lib/theme';
import { useAuth } from './AuthContext';

interface PensumState {
  status: 'loading' | 'ready' | 'empty' | 'error';
  error: string | null;
  data: PensumData | null;
  academic: AcademicState | null;
  courseById: Map<string, Course>;
  termById: Map<string, Term>;
  reload: () => Promise<void>;
  /** Estudiante cuyo progreso se muestra (null = ninguno). */
  progressStudentId: string | null;
  /** Solo admin: elegir de qué estudiante se ve y edita el progreso (null = el estudiante principal del programa). */
  selectStudent: (studentId: string | null) => void;
  /** Persiste el estado y SOLO entonces actualiza la vista. Lanza si falla. */
  changeStatus: (courseId: string, status: ProgressStatus) => Promise<void>;
  /** Solo admin: guarda calificaciones de uno o varios cursos del estudiante en pantalla. */
  saveCourseGrades: (byCourse: Record<string, Grades>) => Promise<void>;
  /** Solo admin: borra las calificaciones de un curso. */
  clearCourseGrades: (courseId: string) => Promise<void>;
}

const PensumContext = createContext<PensumState | null>(null);

export function PensumProvider({ children }: { children: ReactNode }) {
  const { isAdmin, isStudent, session, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<PensumState['status']>('loading');
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PensumData | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const userId = session?.user.id ?? null;

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      setError(null);
      const program = await fetchProgram();
      if (!program) {
        setData(null);
        setStatus('empty');
        return;
      }
      applyAccent(program.accentColor);
      applyFavicon(program.logoUrl);
      // Cada quien ve el progreso que le corresponde; RLS lo vuelve a comprobar en la base.
      const progressStudentId = isAdmin
        ? (selectedStudentId ?? program.studentId)
        : isStudent
          ? userId
          : program.isPublic && program.showProgressPublic
            ? program.studentId
            : null;
      setData(await fetchPensum(program, { progressStudentId }));
      setStatus('ready');
    } catch (e) {
      setError(friendlyError(e));
      setStatus('error');
    }
  }, [isAdmin, isStudent, userId, selectedStudentId]);

  useEffect(() => {
    if (!authLoading) void reload();
  }, [authLoading, reload]);

  // Al cerrar sesión o cambiar de usuario, se olvida el estudiante elegido.
  useEffect(() => setSelectedStudentId(null), [userId]);

  const progressStudentId = data?.progressStudentId ?? null;

  const changeStatus = useCallback(
    async (courseId: string, next: ProgressStatus) => {
      if (!progressStudentId) throw new Error('No hay un estudiante seleccionado.');
      await setProgress(progressStudentId, courseId, next);
      setData((d) => (d ? { ...d, progress: setCourseStatus(d.progress, courseId, next) } : d));
    },
    [progressStudentId],
  );

  /** Guarda calificaciones (transacción) y SOLO entonces actualiza la vista; la base sincroniza la aprobación. */
  const saveCourseGrades = useCallback(
    async (byCourse: Record<string, Grades>) => {
      if (!progressStudentId) throw new Error('No hay un estudiante seleccionado.');
      await saveGrades(progressStudentId, byCourse);
      setData((d) => (d ? { ...d, grades: { ...d.grades, ...byCourse } } : d));
    },
    [progressStudentId],
  );

  const clearCourseGrades = useCallback(
    async (courseId: string) => {
      if (!progressStudentId) throw new Error('No hay un estudiante seleccionado.');
      await deleteGrades(progressStudentId, courseId);
      setData((d) => {
        if (!d) return d;
        const grades = { ...d.grades };
        delete grades[courseId];
        // Borrar las notas también quita la aprobación derivada (trigger en la base).
        return { ...d, grades, progress: setCourseStatus(d.progress, courseId, 'pending') };
      });
    },
    [progressStudentId],
  );

  // Tiempo real: cuando el admin cambia una nota, la vista del estudiante se actualiza sola.
  // Si el canal falla, los datos igualmente se refrescan en la siguiente consulta.
  // Refs: el canal no debe reconectarse en cada render (toast y data cambian a menudo).
  const toastRef = useRef(useToast());
  const dataRef = useRef(data);
  dataRef.current = data;
  useEffect(() => {
    if (!supabase || !progressStudentId || isAdmin) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(`grades-${progressStudentId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'course_grades', filter: `student_id=eq.${progressStudentId}` },
        (payload) => {
          const row = (payload.new ?? {}) as { course_id?: string; evaluation_status?: EvaluationStatus };
          const course = row.course_id ? dataRef.current?.courses.find((c) => c.id === row.course_id) : undefined;
          const message =
            row.evaluation_status === 'approved'
              ? 'Curso aprobado'
              : row.evaluation_status === 'preapproved'
                ? 'Examen final pendiente'
                : 'Calificación actualizada';
          toastRef.current.success(course ? `${message}: ${course.code} · ${course.name}` : message);
          clearTimeout(timer);
          timer = setTimeout(() => void reload(), 400);
        },
      )
      .subscribe();
    return () => {
      clearTimeout(timer);
      void supabase!.removeChannel(channel);
    };
  }, [progressStudentId, isAdmin, reload]);

  const academic = useMemo(
    () => (data ? computeAcademicState(data.courses, data.requirements, data.progress, data.grades) : null),
    [data],
  );
  const courseById = useMemo(() => new Map((data?.courses ?? []).map((c) => [c.id, c])), [data]);
  const termById = useMemo(() => new Map((data?.terms ?? []).map((t) => [t.id, t])), [data]);

  return (
    <PensumContext.Provider
      value={{
        status,
        error,
        data,
        academic,
        courseById,
        termById,
        reload,
        progressStudentId,
        selectStudent: setSelectedStudentId,
        changeStatus,
        saveCourseGrades,
        clearCourseGrades,
      }}
    >
      {children}
    </PensumContext.Provider>
  );
}

export function usePensum(): PensumState {
  const ctx = useContext(PensumContext);
  if (!ctx) throw new Error('usePensum debe usarse dentro de <PensumProvider>.');
  return ctx;
}
