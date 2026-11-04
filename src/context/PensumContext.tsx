import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Course, PensumData, ProgressStatus, Term } from '../types/domain';
import { computeAcademicState, setCourseStatus, type AcademicState } from '../lib/engine/academic';
import { fetchPensum, fetchProgram, setProgress } from '../services/pensumService';
import { friendlyError, isSupabaseConfigured } from '../services/supabase';
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

  const academic = useMemo(
    () => (data ? computeAcademicState(data.courses, data.requirements, data.progress) : null),
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
