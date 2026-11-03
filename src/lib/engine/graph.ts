import type { Requirement } from '../../types/domain';

/** Aristas curso → cursos que requiere. */
export type DependencyGraph = Map<string, Set<string>>;

export function buildGraph(requirements: Record<string, Requirement[]>): DependencyGraph {
  const graph: DependencyGraph = new Map();
  for (const [courseId, reqs] of Object.entries(requirements)) {
    const deps = new Set<string>();
    for (const r of reqs) if (r.type === 'courses') r.courseIds.forEach((id) => deps.add(id));
    graph.set(courseId, deps);
  }
  return graph;
}

/**
 * Busca un ciclo en el grafo. Devuelve la ruta del ciclo (p. ej. [A, B, C, A]) o null.
 * DFS iterativo con colores: no desborda la pila con pensums grandes.
 */
export function findCycle(graph: DependencyGraph): string[] | null {
  const color = new Map<string, 0 | 1 | 2>(); // 0 = sin visitar, 1 = en la ruta actual, 2 = terminado
  const parent = new Map<string, string>();
  for (const start of graph.keys()) {
    if (color.get(start)) continue;
    const stack: Array<{ node: string; it: Iterator<string> }> = [];
    color.set(start, 1);
    stack.push({ node: start, it: (graph.get(start) ?? new Set()).values() });
    while (stack.length) {
      const top = stack[stack.length - 1]!;
      const next = top.it.next();
      if (next.done) {
        color.set(top.node, 2);
        stack.pop();
        continue;
      }
      const dep = next.value;
      const c = color.get(dep) ?? 0;
      if (c === 1) {
        const path = [dep];
        for (let n = top.node; n !== dep; n = parent.get(n)!) path.push(n);
        path.push(dep);
        return path.reverse();
      }
      if (c === 0) {
        parent.set(dep, top.node);
        color.set(dep, 1);
        stack.push({ node: dep, it: (graph.get(dep) ?? new Set()).values() });
      }
    }
  }
  return null;
}

/**
 * ¿Asignar `newRequirements` a `courseId` crearía una dependencia circular?
 * Devuelve la ruta del ciclo, o null si es seguro.
 */
export function wouldCreateCycle(
  allRequirements: Record<string, Requirement[]>,
  courseId: string,
  newRequirements: Requirement[],
): string[] | null {
  return findCycle(buildGraph({ ...allRequirements, [courseId]: newRequirements }));
}

/** Cursos que dependen directamente de `courseId` (lo tienen como prerrequisito). */
export function dependentsOf(requirements: Record<string, Requirement[]>, courseId: string): string[] {
  return Object.entries(requirements)
    .filter(([, reqs]) => reqs.some((r) => r.type === 'courses' && r.courseIds.includes(courseId)))
    .map(([id]) => id);
}
