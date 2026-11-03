import { useState } from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';
import type { Course, Requirement } from '../../types/domain';

interface Props {
  value: Requirement[];
  onChange: (reqs: Requirement[]) => void;
  /** Cursos que pueden elegirse como prerrequisito (todos menos el propio). */
  candidates: Course[];
}

/** Editor de reglas. El curso queda disponible cuando se cumplen TODAS las reglas. */
export function RequirementEditor({ value, onChange, candidates }: Props) {
  const update = (i: number, r: Requirement) => onChange(value.map((x, j) => (j === i ? r : x)));
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));
  const hasCredits = value.some((r) => r.type === 'credits');

  return (
    <div className="space-y-3">
      {value.length === 0 && <p className="text-sm text-slate-500">Sin prerrequisitos: el curso siempre está disponible.</p>}
      {value.map((r, i) => (
        <div key={i} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <div className="mb-2 flex items-center justify-between gap-2">
            {r.type === 'courses' ? (
              <select
                className="input w-auto py-1.5"
                aria-label="Tipo de condición"
                value={r.mode}
                onChange={(e) => update(i, { ...r, mode: e.target.value as 'all' | 'any' })}
              >
                <option value="all">Aprobar todos estos cursos</option>
                <option value="any">Aprobar al menos uno de estos</option>
              </select>
            ) : (
              <span className="text-sm font-medium">Créditos acumulados mínimos</span>
            )}
            <button type="button" className="btn-ghost p-1.5 text-red-600" onClick={() => remove(i)} aria-label="Quitar condición">
              <Trash2 className="size-4" />
            </button>
          </div>
          {r.type === 'courses' ? (
            <CoursePicker selected={r.courseIds} candidates={candidates} onChange={(ids) => update(i, { ...r, courseIds: ids })} />
          ) : (
            <input
              type="number"
              min={0}
              step="any"
              className="input"
              aria-label="Créditos mínimos"
              value={Number.isNaN(r.minCredits) ? '' : r.minCredits}
              onChange={(e) => update(i, { ...r, minCredits: e.target.value === '' ? NaN : Number(e.target.value) })}
            />
          )}
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary py-1.5 text-xs" disabled={candidates.length === 0} onClick={() => onChange([...value, { type: 'courses', mode: 'all', courseIds: [] }])}>
          <Plus className="size-3.5" /> Cursos requeridos
        </button>
        <button type="button" className="btn-secondary py-1.5 text-xs" disabled={hasCredits} onClick={() => onChange([...value, { type: 'credits', minCredits: NaN }])}>
          <Plus className="size-3.5" /> Créditos mínimos
        </button>
      </div>
    </div>
  );
}

function CoursePicker({ selected, candidates, onChange }: { selected: string[]; candidates: Course[]; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const list = candidates.filter((c) => !query || `${c.code} ${c.name}`.toLowerCase().includes(query));
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div>
      {candidates.length > 6 && (
        <label className="relative mb-2 block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
          <input className="input py-1.5 pl-8 text-xs" placeholder="Filtrar cursos…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filtrar cursos" />
        </label>
      )}
      <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-lg bg-slate-50 p-1.5 dark:bg-slate-800/50">
        {list.map((c) => (
          <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-white dark:hover:bg-slate-800">
            <input type="checkbox" className="size-4 accent-brand-600" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} />
            <span className="font-mono text-xs text-slate-500">{c.code}</span>
            <span className="truncate">{c.name}</span>
          </label>
        ))}
        {list.length === 0 && <p className="px-2 py-1 text-xs text-slate-500">Sin coincidencias.</p>}
      </div>
      <p className="mt-1 text-xs text-slate-500">{selected.length} seleccionado(s)</p>
    </div>
  );
}
