import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePensum } from '../../context/PensumContext';
import { ProgramLogo } from '../../components/layout/ProgramLogo';
import { friendlyError } from '../../services/supabase';
import { ADMIN_PATH } from '../../config';

/**
 * Inicio de sesión. `student` (/ingresar): el estudiante entra a su pensum personal.
 * `admin` (ADMIN_PATH/login): acceso al panel. Misma autenticación; el destino depende del rol.
 */
export function LoginPage({ mode = 'admin' }: { mode?: 'admin' | 'student' }) {
  const { session, isAdmin, isStudent, loading, profileIssue, signIn, signOut } = useAuth();
  const { data } = usePensum();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const student = mode === 'student';

  if (!loading && session) {
    if (student && (isStudent || isAdmin)) return <Navigate to="/" replace />;
    if (!student && isAdmin) return <Navigate to={ADMIN_PATH} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  }

  const blocked = session && !loading && (student ? !isStudent && !isAdmin : !isAdmin);
  const blockedMessage = profileIssue?.startsWith('error:')
    ? `Iniciaste sesión, pero no se pudo leer tu perfil: ${profileIssue.slice(6)}`
    : student
      ? `Tu cuenta (${session?.user.email}) todavía no está habilitada como estudiante. Pide al administrador que la active.`
      : profileIssue === 'missing'
        ? `Tu cuenta (${session?.user.email}) no tiene perfil en este proyecto de Supabase. Ejecuta la consulta de «Crear el administrador» del README en este mismo proyecto.`
        : `Tu cuenta (${session?.user.email}) tiene perfil, pero no con rol de administrador. Ejecuta la consulta de «Crear el administrador» del README.`;

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-6 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="size-4" /> {student ? 'Volver al pensum' : 'Ver pensum público'}
        </Link>
        <div className="card border-t-4 border-t-accent-600 p-6 sm:p-8">
          <ProgramLogo size="lg" logoUrl={data?.program.logoUrl} name={data?.program.institution ?? data?.program.name} />
          <h1 className="mt-4 text-xl font-bold">{student ? 'Iniciar sesión' : 'Administración'}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {student ? 'Entra con las credenciales que te entregaron para ver tu progreso.' : 'Inicia sesión con tu cuenta autorizada.'}
          </p>

          {blocked && (
            <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" role="alert">
              <p>{blockedMessage}</p>
              <button type="button" className="mt-2 font-medium underline" onClick={() => signOut()}>
                Usar otra cuenta
              </button>
            </div>
          )}

          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="label">Correo electrónico</label>
              <input id="email" type="email" autoComplete="username" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label htmlFor="password" className="label">Contraseña</label>
              <input id="password" type="password" autoComplete="current-password" required className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && (
              <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="btn-primary w-full py-2.5" disabled={submitting || !email || !password}>
              {submitting && <Loader2 className="size-4 animate-spin" />} Iniciar sesión
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
