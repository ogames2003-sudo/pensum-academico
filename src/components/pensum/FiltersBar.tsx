import { Search, X } from 'lucide-react';
import type { Term } from '../../types/domain';
import { EMPTY_FILTERS, hasActiveFilters, type PensumFilters } from '../../lib/pensumView';

interface Props {
  filters: PensumFilters;
  onChange: (f: PensumFilters) => void;
  terms: Term[];
  areas: string[];
  termLabel: string;
  showProgress: boolean;
  resultCount: number;
}

export function FiltersBar({ filters, onChange, terms, areas, termLabel, showProgress, resultCount }: Props) {
  const set = <K extends keyof PensumFilters>(k: K, v: PensumFilters[K]) => onChange({ ...filters, [k]: v });
  return (
    <div className="card no-print p-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Buscar cursos</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            className="input pl-9"
            placeholder="Buscar por nombre, código o área…"
            value={filters.search}
            onChange={(e) => set('search', e.target.value)}
          />
        </label>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <select className="input sm:w-auto" aria-label={`Filtrar por ${termLabel.toLowerCase()}`} value={filters.termId} onChange={(e) => set('termId', e.target.value)}>
            <option value="">Todos los {termLabel.toLowerCase()}s</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {showProgress && (
            <>
              <select className="input sm:w-auto" aria-label="Filtrar por estado" value={filters.status} onChange={(e) => set('status', e.target.value as PensumFilters['status'])}>
                <option value="">Todos los estados</option>
                <option value="approved">Aprobados</option>
                <option value="pending">Pendientes</option>
              </select>
              <select className="input sm:w-auto" aria-label="Filtrar por disponibilidad" value={filters.availability} onChange={(e) => set('availability', e.target.value as PensumFilters['availability'])}>
                <option value="">Cualquier disponibilidad</option>
                <option value="available">Disponibles</option>
                <option value="blocked">Bloqueados</option>
              </select>
            </>
          )}
          {areas.length > 0 && (
            <select className="input sm:w-auto" aria-label="Filtrar por área" value={filters.area} onChange={(e) => set('area', e.target.value)}>
              <option value="">Todas las áreas</option>
              {areas.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          )}
        </div>
      </div>
      {hasActiveFilters(filters) && (
        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
          <span aria-live="polite">{resultCount} curso(s) coinciden</span>
          <button className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline dark:text-brand-100" onClick={() => onChange(EMPTY_FILTERS)}>
            <X className="size-3" /> Limpiar filtros
          </button>
        </div>
      )}
    </div>
  );
}
