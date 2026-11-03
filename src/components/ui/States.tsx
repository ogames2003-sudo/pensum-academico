import type { ComponentType, ReactNode } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-100">
        <Icon className="size-7" />
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      {children && <div className="mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">{children}</div>}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-24 text-sm text-slate-500" role="status">
      <Loader2 className="size-5 animate-spin" /> {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center" role="alert">
      <AlertCircle className="mb-3 size-8 text-red-500" />
      <p className="font-medium">No se pudo cargar la información</p>
      <p className="mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">{message}</p>
      {onRetry && (
        <button className="btn-secondary mt-5" onClick={onRetry}>
          Reintentar
        </button>
      )}
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
      <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${v}%` }} />
    </div>
  );
}
