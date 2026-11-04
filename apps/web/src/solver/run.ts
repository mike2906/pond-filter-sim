import {
  solveWithUncertainty,
  waterKinematicViscosity,
  type Design,
  type Id,
  type Link,
  type SolveResult,
  type UncertainSolveResult,
} from '@pond/engine';
import { driverHead, driverMaxFlow, passiveLoss, previewSolve, setAirliftScale } from './preview';

/**
 * engine: the network solver, every element modelled.
 * mixed: the network solver, with placeholder curves standing in for elements whose models aren't built yet.
 * preview: the engine could not run, so the simplified preview maths was used for everything.
 */
export type ResultSource = 'engine' | 'mixed' | 'preview';

export interface Solved {
  /** Likely, low-flow and high-flow cases. Draw any value as a band from low to high. */
  cases: UncertainSolveResult;
  /** Shorthand for cases.likely. */
  result: SolveResult;
  source: ResultSource;
  /** Elements standing in with placeholder curves (source 'mixed'). */
  placeholders: Id[];
  ms: number;
}

/** Whether the low and high cases differ from the likely case at all. */
export function hasBand(c: UncertainSolveResult): boolean {
  return c.low !== c.likely || c.high !== c.likely;
}

const SAMPLES = 16;

function needsPlaceholder(l: Link): boolean {
  if (l.isolated) return false;
  if (l.kind === 'airlift') return true;
  return l.kind === 'stage' && l.stage.type !== 'generic' && !(l.measured && l.measured.points.length > 0);
}

/**
 * Swap elements the engine can't model yet for curves the engine can: a stage
 * becomes a measured head-loss curve from the preview resistance, an airlift a
 * pump with the preview's placeholder line. Ids are kept so results map back.
 */
function substitute(design: Design, airliftScale: number): { design: Design; replaced: Id[] } {
  const nu = waterKinematicViscosity(design.water.tempC);
  const replaced: Id[] = [];
  setAirliftScale(airliftScale);
  const links = design.links.map((l): Link => {
    if (!needsPlaceholder(l)) return l;
    replaced.push(l.id);
    if (l.kind === 'airlift') {
      const qMax = Math.max(1e-6, driverMaxFlow(l));
      const curve = Array.from({ length: SAMPLES }, (_, i) => {
        const q = (qMax * i) / (SAMPLES - 1);
        return { flowM3s: q, headM: driverHead(l, q) };
      });
      const { id, from, to, name, isolated } = l;
      return { id, from, to, kind: 'pump', ...(name ? { name } : {}), ...(isolated ? { isolated } : {}), curve, speedFraction: 1, intakeElevationM: l.inletElevationM };
    }
    // Sample to a generous flow so the solver never extrapolates far.
    const qMax = 0.06;
    const points = Array.from({ length: SAMPLES }, (_, i) => {
      const q = qMax * (i / (SAMPLES - 1)) ** 2;
      return { flowM3s: q, headLossM: passiveLoss(l, q, nu).headLossM };
    });
    return { ...l, measured: { points } } as Link;
  });
  setAirliftScale(1);
  return { design: { ...design, links }, replaced };
}

function label(r: SolveResult, design: Design, replaced: Id[]): SolveResult {
  if (replaced.length === 0) return r;
  const links = { ...r.links };
  for (const id of replaced) {
    const lr = links[id];
    if (!lr) continue;
    const kind = design.links.find((l) => l.id === id)?.kind;
    links[id] = {
      ...lr,
      confidence: 'unvalidated',
      basis: kind === 'airlift' ? 'Placeholder line until the airlift model (milestone 3)' : 'Placeholder resistance until filter-stage models (milestone 4)',
    };
  }
  const budget = r.budget.map((b) =>
    replaced.includes(b.linkId) ? { ...b, parts: b.parts.map((p) => ({ ...p, label: p.label === 'Measured curve' ? 'Placeholder estimate' : p.label })) } : b,
  );
  const nodes = Object.fromEntries(Object.entries(r.nodes).map(([k, v]) => [k, { ...v, confidence: 'unvalidated' as const }]));
  return { ...r, links, nodes, budget };
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

function engineCases(design: Design, initial?: SolveResult): { cases: UncertainSolveResult; replaced: Id[] } {
  const sub = substitute(design, 1);
  const base = solveWithUncertainty(sub.design, initial ? { initial } : {});
  const hasAirlift = design.links.some((l) => l.kind === 'airlift' && !l.isolated);
  const lab = (r: SolveResult) => label(r, design, sub.replaced);
  if (!hasAirlift) {
    return { cases: { likely: lab(base.likely), low: lab(base.low), high: lab(base.high), varied: base.varied }, replaced: sub.replaced };
  }
  const low = solveWithUncertainty(substitute(design, 0.7).design).likely;
  const high = solveWithUncertainty(substitute(design, 1.3).design).likely;
  return {
    cases: {
      likely: lab(base.likely),
      low: lab(low),
      high: lab(high),
      varied: [...base.varied, 'Airlift capacity ±30% (placeholder band until the airlift model lands)'],
    },
    replaced: sub.replaced,
  };
}

/**
 * The engine's network solver, with placeholder curves for elements it can't
 * model yet. If the engine itself fails, the preview maths stands in.
 */
export function runSolve(design: Design, initial?: SolveResult): Solved {
  const t0 = performance.now();
  try {
    const { cases, replaced } = engineCases(design, initial);
    return { cases, result: cases.likely, source: replaced.length ? 'mixed' : 'engine', placeholders: replaced, ms: performance.now() - t0 };
  } catch {
    const cases = preview(design);
    return { cases, result: cases.likely, source: 'preview', placeholders: [], ms: performance.now() - t0 };
  }
}

/** Likely-case solve only, for sweeps and goal seek. */
export function runSolveLikely(design: Design): SolveResult {
  try {
    const sub = substitute(design, 1);
    return label(solveWithUncertainty(sub.design).likely, design, sub.replaced);
  } catch {
    return previewSolve(design);
  }
}
