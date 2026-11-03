import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

interface Toast {
  id: number;
  kind: 'success' | 'error';
  message: string;
}
interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: Toast['kind'], message: string) => {
    const id = nextId++;
    setToasts((t) => [...t, { id, kind, message }]);
    // Los errores permanecen más tiempo: hay que poder leerlos.
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 3000);
  }, []);

  const api: ToastApi = {
    success: useCallback((m: string) => push('success', m), [push]),
    error: useCallback((m: string) => push('error', m), [push]),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex max-w-md animate-fade-in items-start gap-2 rounded-xl px-4 py-3 text-sm shadow-lg ${
              t.kind === 'success' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-red-600 text-white'
            }`}
          >
            {t.kind === 'success' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400 dark:text-emerald-600" /> : <XCircle className="mt-0.5 size-4 shrink-0" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>.');
  return ctx;
}
