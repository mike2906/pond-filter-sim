import { checkDesign, type Design, type SolveOptions, type SolveResult } from './model';

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
      warnings: issues.map((i) => ({ code: 'no-operating-point', severity: 'critical', message: `${i.path}: ${i.message}` })),
      iterations: 0,
      residualM3s: Number.NaN,
    };
  }
  throw new Error('The network solver is not implemented yet (milestone 1).');
}
