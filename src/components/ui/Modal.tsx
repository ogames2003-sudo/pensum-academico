import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}

/** Diálogo accesible: foco atrapado, Escape para cerrar y retorno del foco al cerrar. */
export function Modal({ open, title, onClose, children, footer, size = 'md' }: ModalProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  // onClose suele ser una función nueva en cada render: el efecto no debe re-ejecutarse por ella.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])');
    (first ?? panel.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
      if (e.key !== 'Tab' || !panel.current) return;
      const focusables = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const list = Array.from(focusables);
      if (!list.length) return;
      const [firstEl, lastEl] = [list[0]!, list[list.length - 1]!];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previous?.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        className={`card flex max-h-[92vh] w-full animate-fade-in flex-col rounded-b-none sm:rounded-2xl ${size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          <button data-close type="button" onClick={onClose} className="btn-ghost -mr-2 p-2" aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">{footer}</div>
        )}
      </div>
    </div>
  );
}
