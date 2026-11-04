import { checkDesign, type Design, type SolveOptions, type SolveResult, type UncertainSolveResult } from './model';

/**
 * Solve a design's steady-state hydraulics.
 *
 * Pure and synchronous: safe to call from a Web Worker. This is the pinned
 * entry point; the network solver behind it arrives in milestone 1. Until
 * then it validates the design and throws for valid designs.
 */
export function solve(design: Design, opts: SolveOptions = {}): SolveResult {
  void opts;
  const issues = checkDesign(design);
  if (issues.length > 0) {
    return {
      status: 'invalid-design',
      nodes: {},
      links: {},
      criticalPath: [],
      budget: [],
      warnings: issues.map((i) => ({
        code: 'invalid-design' as const,
        severity: 'critical' as const,
        message: i.message,
        ...(i.targetId === undefined ? {} : { targetId: i.targetId }),
      })),
      iterations: 0,
      residualM3s: Number.NaN,
    };
  }
  throw new Error('The network solver is not implemented yet (milestone 1).');
}

/**
 * Solve the likely, low and high cases. Pinned entry point; until milestone 1
 * it has the same behaviour as `solve`, with all three cases identical.
 */
export function solveWithUncertainty(design: Design, opts: SolveOptions = {}): UncertainSolveResult {
  const likely = solve(design, opts);
  return { likely, low: likely, high: likely, varied: [] };
}
