import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { CheckCircle2, Copy, GraduationCap, Loader2, Pencil, Search, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { usePensum } from '../../context/PensumContext';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../../components/ui/Modal';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { copyProgress, createStudent, listUsers, updateStudent, type StudentAccount } from '../../services/studentService';
import { friendlyError } from '../../services/supabase';
import { ADMIN_PATH } from '../../config';

export const fullName = (u: Pick<StudentAccount, 'firstName' | 'lastName' | 'email'>) =>
  [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email;

const ROLE_LABEL: Record<StudentAccount['role'], string> = { admin: 'Administrador', student: 'Estudiante', viewer: 'Sin habilitar' };

const dateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }) : 'Nunca';

export function StudentsPage() {
  const { data, selectStudent, progressStudentId } = usePensum();
  const { session } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [users, setUsers] = useState<StudentAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<StudentAccount | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setUsers(await listUsers());
    } catch (e) {
      setError(friendlyError(e));
    }
  }, []);
  useEffect(() => void load(), [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!users) return <LoadingState label="Cargando estudiantes…" />;

  const totalCourses = data?.courses.length ?? 0;
  const q = query.trim().toLowerCase();
  const visible = users.filter((u) => !q || `${fullName(u)} ${u.email}`.toLowerCase().includes(q));

  function manageProgress(u: StudentAccount) {
    selectStudent(u.id);
    navigate(`${ADMIN_PATH}/pensum`);
  }

  async function copyFromMe(u: StudentAccount) {
    const me = session!.user.id;
    const mine = users!.find((x) => x.id === me);
    const ok = await confirm({
      title: `Copiar progreso a ${fullName(u)}`,
      tone: 'warning',
      confirmLabel: 'Copiar progreso',
      message: `Se reemplazará el progreso de ${fullName(u)} (${u.approvedCount} aprobados) por el tuyo (${mine?.approvedCount ?? 0} aprobados).`,
    });
    if (!ok) return;
    try {
      const n = await copyProgress(me, u.id);
      toast.success(`Progreso copiado: ${n} cursos aprobados.`);
      await load();
    } catch (e) {
      toast.error(`No se copió: ${friendlyError(e)}`);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Estudiantes</h1>
          <p className="text-sm text-slate-500">
            Usuarios registrados, con o sin sesión iniciada. Cada estudiante ve solo su propio progreso.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}>
          <UserPlus className="size-4" /> Crear estudiante
        </button>
      </div>

      {users.length === 0 ? (
        <EmptyState icon={Users} title="Aún no hay usuarios registrados" />
      ) : (
        <>
          <label className="relative block max-w-sm">
            <span className="sr-only">Buscar estudiantes</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" type="search" placeholder="Buscar por nombre o correo…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <ul className="card divide-y divide-slate-100 dark:divide-slate-800">
            {visible.map((u) => {
              const isMe = u.id === session?.user.id;
              const selected = u.id === progressStudentId;
              return (
                <li key={u.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {fullName(u)}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          u.role === 'student'
                            ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-100'
                            : u.role === 'admin'
                              ? 'bg-accent-50 text-accent-700 dark:bg-accent-900/40 dark:text-accent-100'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {u.role === 'admin' && <ShieldCheck className="mr-0.5 inline size-3" />}
                        {ROLE_LABEL[u.role]}
                        {isMe && ' (tú)'}
                      </span>
                      {selected && <span className="text-xs font-normal text-emerald-600">· progreso en pantalla</span>}
                    </p>
                    <p className="truncate text-xs text-slate-500">{u.email}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      <CheckCircle2 className="mr-1 inline size-3 text-emerald-600" />
                      {u.approvedCount}/{totalCourses} aprobados · Último acceso: {dateTime(u.lastSignInAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => manageProgress(u)}>
                      <GraduationCap className="size-3.5" /> Ver y editar progreso
                    </button>
                    {!isMe && (
                      <button className="btn-ghost px-2 py-1.5 text-xs" onClick={() => copyFromMe(u)} title="Copiar tu progreso a este estudiante">
                        <Copy className="size-3.5" /> Copiar mi progreso
                      </button>
                    )}
                    {u.role !== 'admin' && (
                      <button className="btn-ghost p-1.5" onClick={() => setEditing(u)} aria-label={`Editar ${fullName(u)}`}>
                        <Pencil className="size-4" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
            {visible.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">Sin coincidencias.</li>}
          </ul>
        </>
      )}

      {creating && (
        <CreateStudentModal
          onClose={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false);
            await load();
          }}
        />
      )}
      {editing && (
        <EditStudentModal
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function CreateStudentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const toast = useToast();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!form.firstName.trim() || !form.lastName.trim()) return setErr('Escribe el nombre y el apellido.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setErr('Escribe un correo válido.');
    if (form.password.length < 8) return setErr('La contraseña debe tener al menos 8 caracteres.');
    setSaving(true);
    try {
      const { needsEmailConfirmation } = await createStudent(form);
      toast.success(
        needsEmailConfirmation
          ? `Cuenta creada. ${form.firstName} debe confirmar su correo antes de iniciar sesión.`
          : `Cuenta de ${form.firstName} creada. Ya puede iniciar sesión.`,
      );
      await onCreated();
    } catch (e2) {
      setErr(friendlyError(e2));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title="Crear estudiante"
      onClose={() => !saving && onClose()}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" form="create-student" className="btn-primary" disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />} Crear cuenta
          </button>
        </>
      }
    >
      <form id="create-student" onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="s-first" className="label">Nombre *</label>
            <input id="s-first" className="input" autoComplete="off" maxLength={80} value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />
          </div>
          <div>
            <label htmlFor="s-last" className="label">Apellido *</label>
            <input id="s-last" className="input" autoComplete="off" maxLength={80} value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
          </div>
        </div>
        <div>
          <label htmlFor="s-email" className="label">Correo del estudiante *</label>
          <input id="s-email" type="email" className="input" autoComplete="off" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </div>
        <div>
          <label htmlFor="s-pass" className="label">Contraseña inicial *</label>
          <input id="s-pass" type="password" className="input" autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} />
          <p className="mt-1 text-xs text-slate-500">Mínimo 8 caracteres. Entrégasela al estudiante por un medio privado.</p>
        </div>
        {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300" role="alert">No se creó: {err}</p>}
      </form>
    </Modal>
  );
}

function EditStudentModal({ user, onClose, onSaved }: { user: StudentAccount; onClose: () => void; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [firstName, setFirstName] = useState(user.firstName ?? '');
  const [lastName, setLastName] = useState(user.lastName ?? '');
  const [enabled, setEnabled] = useState(user.role === 'student');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await updateStudent(user.id, firstName, lastName, enabled ? 'student' : 'viewer');
      toast.success('Estudiante actualizado.');
      await onSaved();
    } catch (e2) {
      setErr(friendlyError(e2));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={`Editar ${fullName(user)}`}
      onClose={() => !saving && onClose()}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" form="edit-student" className="btn-primary" disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />} Guardar
          </button>
        </>
      }
    >
      <form id="edit-student" onSubmit={onSubmit} className="space-y-4" noValidate>
        <p className="text-sm text-slate-500">{user.email}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="e-first" className="label">Nombre</label>
            <input id="e-first" className="input" maxLength={80} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="e-last" className="label">Apellido</label>
            <input id="e-last" className="input" maxLength={80} value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1 size-4 accent-brand-600" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span className="text-sm">
            <span className="font-medium">Cuenta habilitada como estudiante</span>
            <span className="block text-xs text-slate-500">Si la desactivas, deja de ver su pensum y progreso (su progreso se conserva).</span>
          </span>
        </label>
        {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300" role="alert">No se guardó: {err}</p>}
      </form>
    </Modal>
  );
}
