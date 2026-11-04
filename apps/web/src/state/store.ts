import type { Design, Id, Link } from '@pond/engine';
import { enableMapSet, produce, type Draft } from 'immer';
import { create } from 'zustand';
import type { Solved } from '../solver/run';
import { withAutoLayout } from '../components/layout';
import { makeLink, makeNode, type LinkKind, type NodeKind } from './factory';

enableMapSet();

const HISTORY_LIMIT = 100;

export interface DesignState {
  design: Design;
  past: Design[];
  future: Design[];
  selection: Id | null;
  solved: Solved | null;
  solving: boolean;

  /** Replace the whole design (template, import, share link). Recorded in history unless `fresh`. */
  load: (design: Design, opts?: { fresh?: boolean }) => void;
  /** Change the design. `record: false` skips history (used during a drag after `checkpoint`). */
  edit: (recipe: (d: Draft<Design>) => void, opts?: { record?: boolean }) => void;
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  select: (id: Id | null) => void;
  addNode: (kind: NodeKind) => Id;
  addLink: (kind: LinkKind, from: Id, to: Id) => Id;
  remove: (id: Id) => void;
  setSolved: (s: Solved | null) => void;
  setSolving: (b: boolean) => void;
}

function push(past: Design[], d: Design) {
  const next = [...past, d];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

export function createDesignStore(initial: Design) {
  return create<DesignState>()((set, get) => ({
    design: withAutoLayout(initial),
    past: [],
    future: [],
    selection: null,
    solved: null,
    solving: false,

    load: (design, opts) =>
      set((s) => ({
        design: withAutoLayout(design),
        past: opts?.fresh ? [] : push(s.past, s.design),
        future: [],
        selection: null,
      })),

    edit: (recipe, opts) =>
      set((s) => {
        const next = produce(s.design, recipe);
        if (next === s.design) return {};
        return opts?.record === false ? { design: next } : { design: next, past: push(s.past, s.design), future: [] };
      }),

    checkpoint: () => set((s) => ({ past: push(s.past, s.design), future: [] })),

    undo: () =>
      set((s) => {
        const prev = s.past[s.past.length - 1];
        if (!prev) return {};
        return { design: prev, past: s.past.slice(0, -1), future: [s.design, ...s.future], selection: keepSelection(prev, s.selection) };
      }),

    redo: () =>
      set((s) => {
        const next = s.future[0];
        if (!next) return {};
        return { design: next, past: push(s.past, s.design), future: s.future.slice(1), selection: keepSelection(next, s.selection) };
      }),

    select: (id) => set({ selection: id }),

    addNode: (kind) => {
      const node = makeNode(get().design, kind);
      get().edit((d) => {
        d.nodes.push(node);
        const xs = Object.values(d.layout ?? {}).map((p) => p.xM);
        d.layout ??= {};
        d.layout[node.id] = { xM: xs.length ? Math.max(...xs) + 1 : 0, yM: 0 };
      });
      set({ selection: node.id });
      return node.id;
    },

    addLink: (kind, from, to) => {
      const link = makeLink(get().design, kind, from, to);
      get().edit((d) => {
        d.links.push(link as Draft<Link>);
      });
      set({ selection: link.id });
      return link.id;
    },

    remove: (id) => {
      get().edit((d) => {
        const isNode = d.nodes.some((n) => n.id === id);
        if (isNode) {
          d.nodes = d.nodes.filter((n) => n.id !== id);
          d.links = d.links.filter((l) => l.from !== id && l.to !== id);
        } else {
          d.links = d.links.filter((l) => l.id !== id);
        }
        if (d.layout) {
          const ids = new Set([...d.nodes.map((n) => n.id), ...d.links.map((l) => l.id)]);
          for (const k of Object.keys(d.layout)) if (!ids.has(k)) delete d.layout[k];
        }
      });
      set({ selection: null });
    },

    setSolved: (solved) => set({ solved }),
    setSolving: (solving) => set({ solving }),
  }));
}

function keepSelection(d: Design, sel: Id | null): Id | null {
  if (!sel) return null;
  return d.nodes.some((n) => n.id === sel) || d.links.some((l) => l.id === sel) ? sel : null;
}

export type DesignStore = ReturnType<typeof createDesignStore>;
