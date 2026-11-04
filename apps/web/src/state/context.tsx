import type { Design } from '@pond/engine';
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { solver } from '../solver/client';
import { saveAutosave } from './persist';
import { createDesignStore, type DesignState, type DesignStore } from './store';

const Ctx = createContext<DesignStore | null>(null);

/** Owns the store, re-solves on every design change, and autosaves. */
export function DesignProvider({ initial, children }: { initial: Design; children: ReactNode }) {
  const ref = useRef<DesignStore | null>(null);
  ref.current ??= createDesignStore(initial);
  const store = ref.current;

  useEffect(() => {
    let seq = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    const run = (design: Design) => {
      const mine = ++seq;
      store.getState().setSolving(true);
      const prev = store.getState().solved;
      const initialResult = prev && prev.source !== 'preview' && prev.result.status === 'ok' ? prev.result : undefined;
      void solver.solve(design, initialResult).then((solved) => {
        if (mine !== seq) return; // a newer design is already solving
        store.getState().setSolved(solved);
        store.getState().setSolving(false);
      });
    };
    run(store.getState().design);
    const unsub = store.subscribe((s, prev) => {
      if (s.design === prev.design) return;
      // Moving things in the plan changes nothing hydraulic, so don't re-solve for it.
      const hydraulicChange = s.design.nodes !== prev.design.nodes || s.design.links !== prev.design.links || s.design.water !== prev.design.water;
      if (hydraulicChange) {
        clearTimeout(timer);
        timer = setTimeout(() => run(s.design), 40);
      }
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveAutosave(s.design), 400);
    });
    return () => {
      unsub();
      clearTimeout(timer);
      clearTimeout(saveTimer);
    };
  }, [store]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useDesignStore(): DesignStore {
  const s = useContext(Ctx);
  if (!s) throw new Error('useDesignStore outside DesignProvider');
  return s;
}

export function useDesign<T>(selector: (s: DesignState) => T): T {
  return useStore(useDesignStore(), selector);
}
