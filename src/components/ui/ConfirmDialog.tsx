import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';

interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'warning' | 'default';
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<ConfirmFn | null>(null);

/** `const ok = await confirm({...})` — confirmación explícita para acciones destructivas o excepcionales. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(v: boolean) => void>(undefined);

  const confirm = useCallback<ConfirmFn>((o) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = undefined;
    setOpts(null);
  }, []);
  const cancel = useCallback(() => close(false), [close]);

  const tone = opts?.tone ?? 'default';
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!opts}
        title={opts?.title ?? ''}
        onClose={cancel}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={cancel}>
              Cancelar
            </button>
            <button type="button" className={tone === 'danger' ? 'btn-danger' : 'btn-primary'} onClick={() => close(true)}>
              {opts?.confirmLabel ?? 'Confirmar'}
            </button>
          </>
        }
      >
        <div className="flex gap-3">
          {tone !== 'default' && (
            <AlertTriangle className={`mt-0.5 size-5 shrink-0 ${tone === 'danger' ? 'text-red-600' : 'text-amber-500'}`} aria-hidden />
          )}
          <div className="text-sm text-slate-600 dark:text-slate-300">{opts?.message}</div>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm debe usarse dentro de <ConfirmProvider>.');
  return ctx;
}
