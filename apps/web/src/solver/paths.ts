import type { Design, Id } from '@pond/engine';

/** A numeric field on a node or link, addressed by element id and a dotted path inside it. */
export interface ParamRef {
  elementId: Id;
  path: string;
}

type Obj = Record<string, unknown>;

export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Obj)[key];
  }
  return cur;
}

/** Mutates `obj` (use inside an immer recipe or on a clone). Creates missing objects. */
export function setPath(obj: unknown, path: string, value: unknown): void {
  const keys = path.split('.');
  let cur = obj as Obj;
  for (const key of keys.slice(0, -1)) {
    const next = cur[key];
    if (next === null || typeof next !== 'object') cur[key] = /^\d+$/.test(key) ? [] : {};
    cur = cur[key] as Obj;
  }
  cur[keys[keys.length - 1]!] = value;
}

export function findElement(design: Design, id: Id) {
  return design.nodes.find((n) => n.id === id) ?? design.links.find((l) => l.id === id);
}

export function getParam(design: Design, ref: ParamRef): number | undefined {
  const el = findElement(design, ref.elementId);
  const v = el ? getPath(el, ref.path) : undefined;
  return typeof v === 'number' ? v : undefined;
}

/** Returns a new design with one parameter changed (structured clone, no immer needed in the worker). */
export function withParam(design: Design, ref: ParamRef, value: number): Design {
  const copy = structuredClone(design);
  const el = findElement(copy, ref.elementId);
  if (el) setPath(el, ref.path, value);
  return copy;
}
