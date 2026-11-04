import { solveWithUncertainty, type Design, type SolveResult, type UncertainSolveResult } from '@pond/engine';
import { previewSolve } from './preview';

export type ResultSource = 'engine' | 'preview';

export interface Solved {
  /** Likely, low-flow and high-flow cases. Draw any value as a band from low to high. */
  cases: UncertainSolveResult;
  /** Shorthand for cases.likely. */
  result: SolveResult;
  source: ResultSource;
  ms: number;
}

/** Whether the low and high cases differ from the likely case at all. */
export function hasBand(c: UncertainSolveResult): boolean {
  return c.low !== c.likely || c.high !== c.likely;
}

function preview(design: Design): UncertainSolveResult {
  const likely = previewSolve(design);
  const hasAirlift = design.links.some((l) => l.kind === 'airlift' && !l.isolated);
  if (!hasAirlift) return { likely, low: likely, high: likely, varied: [] };
  return {
    likely,
    low: previewSolve(design, { airliftScale: 0.7 }),
    high: previewSolve(design, { airliftScale: 1.3 }),
    varied: ['Airlift capacity ±30% (placeholder band until the airlift model lands)'],
  };
}

/**
 * Use the engine's solver when it exists; until milestone 1 lands it throws
 * for valid designs, and the preview solver stands in.
 */
export function runSolve(design: Design, initial?: SolveResult): Solved {
  const t0 = performance.now();
  let cases: UncertainSolveResult;
  let source: ResultSource = 'engine';
  try {
    cases = solveWithUncertainty(design, initial ? { initial } : {});
  } catch {
    cases = preview(design);
    source = 'preview';
  }
  return { cases, result: cases.likely, source, ms: performance.now() - t0 };
}

/** Likely-case solve only, for sweeps and goal seek. */
export function runSolveLikely(design: Design): SolveResult {
  try {
    return solveWithUncertainty(design).likely;
  } catch {
    return previewSolve(design);
  }
}
