import { useEffect, useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { usePensum } from '../../context/PensumContext';
import { listUsers, type StudentAccount } from '../../services/studentService';
import { friendlyError } from '../../services/supabase';

const label = (u: StudentAccount) => [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email;

/** Elige de qué estudiante se muestra y se edita el progreso en el panel. */
export function StudentSwitcher() {
  const { progressStudentId, selectStudent } = usePensum();
  const [users, setUsers] = useState<StudentAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listUsers()
      .then((list) => setUsers(list.filter((u) => u.role !== 'viewer')))
      // Sin la migración 0003 no existe la lista: el panel sigue funcionando con el progreso principal.
      .catch((e) => setError(friendlyError(e)));
  }, []);

  if (error) return null;
  const current = users?.find((u) => u.id === progressStudentId);

  return (
    <div className="no-print card mb-5 flex flex-wrap items-center gap-3 border-l-4 border-l-brand-600 px-4 py-3">
      <GraduationCap className="size-5 shrink-0 text-brand-600 dark:text-brand-100" aria-hidden />
      <label htmlFor="student-switcher" className="text-sm font-medium">
        Progreso de:
      </label>
      <select
        id="student-switcher"
        className="input w-auto min-w-56 py-1.5"
        value={progressStudentId ?? ''}
        disabled={!users}
        onChange={(e) => selectStudent(e.target.value || null)}
      >
        {!users && <option value={progressStudentId ?? ''}>Cargando…</option>}
        {users?.map((u) => (
          <option key={u.id} value={u.id}>
            {label(u)}
            {u.role === 'admin' ? ' (administrador)' : ''}
          </option>
        ))}
      </select>
      {current && <span className="text-xs text-slate-500">Los cambios de aprobado/pendiente se guardan en este estudiante.</span>}
    </div>
  );
}
