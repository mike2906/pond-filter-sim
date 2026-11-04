import { UnsupportedLinkError } from './hydraulics/links';
import { solveNetwork } from './hydraulics/network';
import { checkDesign, type Design, type DesignIssue, type SolveOptions, type SolveResult, type UncertainSolveResult } from './model';

const invalid = (issues: DesignIssue[]): SolveResult => ({
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
});

/**
 * Solve a design's steady-state hydraulics. Pure and synchronous: safe to call
 * from a Web Worker. Components the engine can't model yet return
 * status 'invalid-design' with a message saying which milestone adds them.
 */
export function solve(design: Design, opts: SolveOptions = {}): SolveResult {
  const issues = checkDesign(design);
  if (issues.length > 0) return invalid(issues);
  try {
    return solveNetwork(design, opts);
  } catch (e) {
    if (e instanceof UnsupportedLinkError) return invalid([{ path: e.linkId ?? '', message: e.message, ...(e.linkId ? { targetId: e.linkId } : {}) }]);
    throw e;
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
