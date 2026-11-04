import { createClient } from '@supabase/supabase-js';
import { requireSupabase } from './supabase';

export interface StudentAccount {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: 'admin' | 'student' | 'viewer';
  createdAt: string | null;
  lastSignInAt: string | null;
  approvedCount: number;
}

interface UserRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: StudentAccount['role'];
  created_at: string | null;
  last_sign_in_at: string | null;
  approved_count: number | string;
}

/** Todos los usuarios registrados (con o sin sesión iniciada). Solo admin (RPC verificada en la base). */
export async function listUsers(): Promise<StudentAccount[]> {
  const { data, error } = await requireSupabase().rpc('admin_list_users');
  if (error) throw error;
  return ((data ?? []) as UserRow[]).map((r) => ({
    id: r.id,
    email: r.email,
    firstName: r.first_name,
    lastName: r.last_name,
    role: r.role,
    createdAt: r.created_at,
    lastSignInAt: r.last_sign_in_at,
    approvedCount: Number(r.approved_count),
  }));
}

export async function updateStudent(id: string, firstName: string, lastName: string, role: 'student' | 'viewer'): Promise<void> {
  const { error } = await requireSupabase().rpc('admin_update_student', {
    p_id: id,
    p_first_name: firstName,
    p_last_name: lastName,
    p_role: role,
  });
  if (error) throw error;
}

export async function copyProgress(fromId: string, toId: string): Promise<number> {
  const { data, error } = await requireSupabase().rpc('admin_copy_progress', { p_from: fromId, p_to: toId });
  if (error) throw error;
  return Number(data);
}

export interface NewStudent {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

/**
 * Registra la cuenta con un cliente aparte y SIN guardar sesión: la sesión del administrador no cambia.
 * Solo usa la clave pública (registro normal de Supabase Auth); el rol de estudiante lo asigna después
 * el administrador con admin_update_student (el rol enviado en el registro se ignora en la base).
 */
export async function createStudent(input: NewStudent): Promise<{ id: string; needsEmailConfirmation: boolean }> {
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const signupClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'pensum-signup' },
  });
  const { data, error } = await signupClient.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: { data: { first_name: input.firstName.trim(), last_name: input.lastName.trim() } },
  });
  if (error) throw error;
  const user = data.user;
  // Con correo ya registrado Supabase devuelve un usuario sin identidades (para no revelar cuentas existentes).
  if (!user || (user.identities && user.identities.length === 0)) {
    throw new Error('Ese correo ya tiene una cuenta. Búscala en la lista y habilítala como estudiante.');
  }
  await updateStudent(user.id, input.firstName, input.lastName, 'student');
  await signupClient.auth.signOut().catch(() => {});
  return { id: user.id, needsEmailConfirmation: !data.session };
}
