import { solveNetwork } from './hydraulics/network';
import { checkDesign, type Design, type DesignIssue, type SolveOptions, type SolveResult, type UncertainSolveResult } from './model';

const invalid = (issues: DesignIssue[]): SolveResult => ({
  status: 'invalid-design',
  nodes: {},
  links: {},
  criticalPath: [],
  budget: [],
  unsupported: [],
  warnings: issues.map((i) => ({
    code: 'invalid-design' as const,
    severity: 'critical' as const,
    message: i.message,
    ...(i.targetId === undefined ? {} : { targetId: i.targetId }),
  })),
  iterations: 0,
  residualM3s: Number.NaN,
});

/**
 * Solve a design's steady-state hydraulics. Pure and synchronous: safe to call
 * from a Web Worker. Components the engine can't model yet give status
 * 'unsupported', listing every such link with a 'not-implemented' warning.
 * Never throws: an internal failure comes back as 'did-not-converge'.
 */
export function solve(design: Design, opts: SolveOptions = {}): SolveResult {
  const issues = checkDesign(design);
  if (issues.length > 0) return invalid(issues);
  try {
    return solveNetwork(design, opts);
  } catch (e) {
    return {
      ...invalid([]),
      status: 'did-not-converge',
      warnings: [{ code: 'did-not-converge', severity: 'critical', message: `The solver failed: ${e instanceof Error ? e.message : String(e)}` }],
    };
  }
}

/**
 * Solve the likely, low and high cases. In milestone 1 no model is varied yet
 * (all hydraulics are deterministic), so the three cases are identical.
 */
export function solveWithUncertainty(design: Design, opts: SolveOptions = {}): UncertainSolveResult {
  const likely = solve(design, opts);
  return { likely, low: likely, high: likely, varied: [] };
}
