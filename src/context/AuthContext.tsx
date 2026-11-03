import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';

type Role = 'admin' | 'student' | 'viewer';

interface AuthState {
  loading: boolean;
  session: Session | null;
  role: Role | null;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    async function load(s: Session | null) {
      if (!s) {
        if (active) {
          setSession(null);
          setRole(null);
          setLoading(false);
        }
        return;
      }
      // El rol se lee de la base (protegida por RLS); nunca se deduce en el cliente.
      const { data } = await supabase!.from('profiles').select('role').eq('id', s.user.id).maybeSingle();
      if (active) {
        setSession(s);
        setRole((data?.role as Role | undefined) ?? 'viewer');
        setLoading(false);
      }
    }

    supabase.auth.getSession().then(({ data }) => load(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // Diferido: no llamar a Supabase dentro del callback (recomendación de supabase-js).
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') setTimeout(() => load(s), 0);
      else if (s) setSession(s);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value: AuthState = {
    loading,
    session,
    role,
    isAdmin: role === 'admin',
    async signIn(email, password) {
      if (!supabase) throw new Error('Supabase no está configurado.');
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setLoading(false);
        throw error;
      }
    },
    async signOut() {
      await supabase?.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>.');
  return ctx;
}
