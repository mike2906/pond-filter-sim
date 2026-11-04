import type { Design } from '@pond/engine';
import { designFromHash, loadAutosave } from './state/persist';
import { DEFAULT_TEMPLATE } from './templates';

export interface Boot {
  design: Design;
  /** Shown once, e.g. when a share link could not be read. */
  message?: string;
}

/** Share link first, then the autosaved design, then the default template. */
export function bootDesign(): Boot {
  const fromHash = designFromHash(window.location.hash);
  if (fromHash?.ok) {
    // Drop the hash so a refresh keeps later edits (autosave) instead of reverting to the link.
    history.replaceState(null, '', window.location.pathname + window.location.search);
    return { design: fromHash.design, message: 'Opened the design from the shared link.' };
  }
  const saved = loadAutosave();
  if (saved) return { design: saved, ...(fromHash && !fromHash.ok ? { message: fromHash.error } : {}) };
  return { design: structuredClone(DEFAULT_TEMPLATE.design), ...(fromHash && !fromHash.ok ? { message: fromHash.error } : {}) };
}
