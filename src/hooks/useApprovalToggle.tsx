import { useState } from 'react';
import type { Course } from '../types/domain';
import { describeMissing } from '../lib/engine/requirements';
import { usePensum } from '../context/PensumContext';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { useToast } from '../components/ui/Toast';
import { friendlyError } from '../services/supabase';

/**
 * Cambia aprobado ⇄ pendiente con guardado inmediato.
 * Aprobar un curso con requisitos sin cumplir exige confirmación y no altera otros cursos.
 * Solo se confirma «guardado» cuando el servidor respondió con éxito.
 */
export function useApprovalToggle() {
  const { academic, courseById, changeStatus } = usePensum();
  const confirm = useConfirm();
  const toast = useToast();
  const [savingId, setSavingId] = useState<string | null>(null);

  async function toggle(course: Course) {
    const state = academic?.byCourse.get(course.id);
    if (!state || savingId) return;
    const next = state.status === 'approved' ? 'pending' : 'approved';

    if (next === 'approved' && state.availability === 'blocked') {
      const ok = await confirm({
        title: 'Requisitos sin cumplir',
        tone: 'warning',
        confirmLabel: 'Aprobar de todos modos',
        message: (
          <>
            <p>
              <strong>{course.code} · {course.name}</strong> tiene requisitos pendientes:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {state.missing.map((m, i) => (
                <li key={i}>{describeMissing(m, courseById)}</li>
              ))}
            </ul>
            <p className="mt-3">Se marcará como aprobado igualmente. Los demás cursos no cambiarán de estado.</p>
          </>
        ),
      });
      if (!ok) return;
    }

    setSavingId(course.id);
    try {
      await changeStatus(course.id, next);
      toast.success(next === 'approved' ? `${course.code} marcado como aprobado.` : `${course.code} marcado como pendiente.`);
    } catch (e) {
      toast.error(`No se guardó el cambio de ${course.code}: ${friendlyError(e)}`);
    } finally {
      setSavingId(null);
    }
  }

  return { toggle, savingId };
}
