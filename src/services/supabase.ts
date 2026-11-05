import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Slug del programa público configurado (opcional). */
export const PROGRAM_SLUG = ((import.meta.env.VITE_PROGRAM_SLUG as string | undefined) ?? '').trim() || null;

export const isSupabaseConfigured = Boolean(url && anonKey);

/** Cliente único con la clave pública (anon). La service_role nunca se usa en el cliente. */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('Supabase no está configurado (faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
  return supabase;
}

/** Traduce errores de PostgREST/Postgres a mensajes comprensibles. */
export function friendlyError(error: unknown): string {
  const e = error as { code?: string; message?: string } | null;
  const msg = e?.message ?? String(error);
  if (e?.code === '42703' || e?.code === 'PGRST204' || /logo_url|programs_accent_color_check/.test(msg)) {
    return 'Falta ejecutar en Supabase la migración supabase/migrations/0002_branding.sql (logo y paleta rojo y azul).';
  }
  if (/course_grades_.*_check/.test(msg)) return 'Una calificación está fuera del rango permitido (A 0–10, E/E1/E2 0–20, EF 0–30).';
  if (/save_grades_batch|course_grades/.test(msg) && (e?.code === 'PGRST202' || e?.code === 'PGRST205' || e?.code === '42P01')) {
    return 'Falta ejecutar en Supabase la migración supabase/migrations/0004_grades.sql (calificaciones).';
  }
  if (e?.code === '23505') {
    if (msg.includes('courses_program_id_code_key')) return 'Ya existe un curso con ese código.';
    if (msg.includes('terms_program_name_uq')) return 'Ya existe un ciclo con ese nombre.';
    if (msg.includes('programs_slug_key')) return 'Ese identificador (slug) ya está en uso.';
    return 'Registro duplicado.';
  }
  if (e?.code === '42501' || /row-level security|No autorizado/i.test(msg)) {
    return 'No tienes permisos para esta operación. Verifica que tu usuario tenga rol de administrador.';
  }
  if (e?.code === '23514' || e?.code === 'P0001') return msg.replace(/^.*?:\s*/, '') || msg;
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.';
  if (/Invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos.';
  if (/Email not confirmed/i.test(msg)) return 'Debes confirmar tu correo antes de iniciar sesión.';
  return msg;
}
