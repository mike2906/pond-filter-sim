import type {
  BudgetEntry,
  Confidence,
  Design,
  Id,
  Link,
  LinkResult,
  NodeResult,
  SolveOptions,
  SolveResult,
  Warning,
} from '../model';
import { GRAVITY, waterDensity, waterKinematicViscosity } from '../water';
import { linkModel, UnsupportedLinkError, type LinkEval, type LinkModel } from './links';

/**
 * Steady-state network solver.
 *
 * Unknowns are the heads of every chamber and junction; ponds are fixed.
 * Continuity Σq = 0 at each unknown node is solved by damped Newton-Raphson
 * with a backtracking line search, in the spirit of the global gradient method
 * (Todini and Pilati 1988) but working directly on link flow laws q(zUp, zDown)
 * so free-surface links (weirs, free-falling openings) need no special case.
 * Jacobian entries come from central differences of each link's law.
 */

const CONFIDENCE_ORDER: Confidence[] = ['validated', 'extrapolated', 'unvalidated'];
const weakest = (a: Confidence, b: Confidence) => (CONFIDENCE_ORDER.indexOf(a) >= CONFIDENCE_ORDER.indexOf(b) ? a : b);

interface Prepared {
  link: Link;
  model: LinkModel;
  from: number; // index into unknowns, or -1 when the end is a pond
  to: number;
  fromFixed: number; // pond level when from === -1
  toFixed: number;
}

export function solveNetwork(design: Design, opts: SolveOptions = {}): SolveResult {
  const ctx = { kinematicViscosity: waterKinematicViscosity(design.water.tempC) };
  const unknownIds: Id[] = [];
  const index = new Map<Id, number>();
  const fixed = new Map<Id, number>();
  for (const n of design.nodes) {
    if (n.kind === 'pond') fixed.set(n.id, n.levelM);
    else {
      index.set(n.id, unknownIds.length);
      unknownIds.push(n.id);
    }
  }

  const prepared: Prepared[] = [];
  const unsupported: Warning[] = [];
  for (const link of design.links.filter((l) => !l.isolated)) {
    let model: LinkModel;
    try {
      model = linkModel(link, ctx);
    } catch (e) {
      if (!(e instanceof UnsupportedLinkError)) throw e;
      unsupported.push({ code: 'not-implemented', severity: 'critical', targetId: link.id, message: `${link.name ?? link.id}: ${e.message}` });
      continue;
    }
    prepared.push({
      link,
      model,
      from: index.get(link.from) ?? -1,
      to: index.get(link.to) ?? -1,
      fromFixed: fixed.get(link.from) ?? 0,
      toFixed: fixed.get(link.to) ?? 0,
    });
  }
  if (unsupported.length > 0) {
    // Report every component that is missing, not just the first, and solve nothing.
    return {
      status: 'unsupported',
      nodes: {},
      links: {},
      criticalPath: [],
      budget: [],
      warnings: unsupported,
      unsupported: unsupported.map((w) => w.targetId as Id),
      iterations: 0,
      residualM3s: Number.NaN,
    };
  }

  const n = unknownIds.length;
  const headOf = (x: Float64Array, i: number, fixedVal: number) => (i >= 0 ? (x[i] as number) : fixedVal);

  const residual = (x: Float64Array) => {
    const r = new Float64Array(n);
    for (const p of prepared) {
      const q = p.model.evaluate(headOf(x, p.from, p.fromFixed), headOf(x, p.to, p.toFixed)).q;
      if (p.from >= 0) r[p.from] = (r[p.from] as number) - q;
      if (p.to >= 0) r[p.to] = (r[p.to] as number) + q;
    }
    return r;
  };
  const norm = (r: Float64Array) => Math.sqrt(r.reduce((s, v) => s + v * v, 0));

  const jacobian = (x: Float64Array) => {
    const J: Float64Array[] = Array.from({ length: n }, () => new Float64Array(n));
    const eps = 1e-6;
    for (const p of prepared) {
      const zu = headOf(x, p.from, p.fromFixed);
      const zd = headOf(x, p.to, p.toFixed);
      const dqdu = p.from >= 0 ? (p.model.evaluate(zu + eps, zd).q - p.model.evaluate(zu - eps, zd).q) / (2 * eps) : 0;
      const dqdd = p.to >= 0 ? (p.model.evaluate(zu, zd + eps).q - p.model.evaluate(zu, zd - eps).q) / (2 * eps) : 0;
      // r[from] -= q, r[to] += q
      if (p.from >= 0) {
        (J[p.from] as Float64Array)[p.from] = ((J[p.from] as Float64Array)[p.from] as number) - dqdu;
        if (p.to >= 0) (J[p.from] as Float64Array)[p.to] = ((J[p.from] as Float64Array)[p.to] as number) - dqdd;
      }
      if (p.to >= 0) {
        (J[p.to] as Float64Array)[p.to] = ((J[p.to] as Float64Array)[p.to] as number) + dqdd;
        if (p.from >= 0) (J[p.to] as Float64Array)[p.from] = ((J[p.to] as Float64Array)[p.from] as number) + dqdu;
      }
    }
    // Tiny leak to every node keeps J invertible when a node's only links are dry weirs.
    for (let i = 0; i < n; i++) (J[i] as Float64Array)[i] = ((J[i] as Float64Array)[i] as number) - 1e-9;
    return J;
  };

  const maxIter = opts.maxIterations ?? 200;
  const tol = 1e-11; // m³/s
  const starts: Float64Array[] = [];
  if (opts.initial) {
    const x0 = new Float64Array(n);
    unknownIds.forEach((id, i) => (x0[i] = opts.initial?.nodes[id]?.levelM ?? 0));
    starts.push(x0);
  }
  const pondMean = fixed.size ? [...fixed.values()].reduce((a, b) => a + b, 0) / fixed.size : 0;
  for (const offset of [-0.01, -0.1, 0.3, -0.5, 1.5]) starts.push(new Float64Array(n).fill(pondMean + offset));

  // Each start keeps its best iterate: only steps that reduce the residual are accepted.
  let best: { x: Float64Array; res: number; iterations: number } | null = null;
  for (const start of starts) {
    const x = Float64Array.from(start);
    let r = residual(x);
    let res = norm(r);
    let it = 0;
    for (; it < maxIter && res > tol; it++) {
      const dx = solveLinear(jacobian(x), r.map((v) => -v));
      if (!dx) break;
      // Limit the step to 0.5 m per node, then backtrack on the residual norm.
      const maxStep = dx.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
      let lambda = maxStep > 0.5 ? 0.5 / maxStep : 1;
      let accepted = false;
      for (let k = 0; k < 30; k++) {
        const trial = x.map((v, i) => v + lambda * (dx[i] as number));
        const rt = residual(trial);
        const nt = norm(rt);
        if (nt < res * (1 - 1e-4 * lambda)) {
          x.set(trial);
          r = rt;
          res = nt;
          accepted = true;
          break;
        }
        lambda /= 2;
      }
      if (!accepted) break;
    }
    if (!best || res < best.res) best = { x, res, iterations: it };
    if (res <= tol) break;
  }

  const x = (best as { x: Float64Array }).x;
  const res = (best as { res: number }).res;
  const result = buildResult(design, prepared, unknownIds, x, fixed, res, (best as { iterations: number }).iterations, res <= 1e-7);
  if (result.status === 'did-not-converge') {
    // Point the user at the node where continuity fails worst.
    const r = residual(x);
    let worst = 0;
    for (let i = 1; i < n; i++) if (Math.abs(r[i] as number) > Math.abs(r[worst] as number)) worst = i;
    const id = unknownIds[worst];
    const node = design.nodes.find((nd) => nd.id === id);
    result.warnings.unshift({
      code: 'did-not-converge',
      severity: 'critical',
      ...(id === undefined ? {} : { targetId: id }),
      message: `The solver could not balance the flows${node ? `; the flow in and out of ${node.name} is off by ${(Math.abs(r[worst] as number) * 3600).toFixed(3)} m³/h` : ''}. Results shown are the closest it got.`,
    });
  }
  return result;
}

function buildResult(
  design: Design,
  prepared: Prepared[],
  unknownIds: Id[],
  x: Float64Array,
  fixed: Map<Id, number>,
  residualM3s: number,
  iterations: number,
  converged: boolean,
): SolveResult {
  const density = waterDensity(design.water.tempC);
  const level = (id: Id) => fixed.get(id) ?? (x[unknownIds.indexOf(id)] as number);
  const warnings: Warning[] = [];
  const links: Record<Id, LinkResult> = {};
  let overall: Confidence = 'validated';
  const evals = new Map<Id, LinkEval>();

  for (const p of prepared) {
    const zu = level(p.link.from);
    const zd = level(p.link.to);
    const e = p.model.evaluate(zu, zd);
    evals.set(p.link.id, e);
    const confidence = p.model.confidenceAt?.(e.q) ?? p.model.confidence;
    overall = weakest(overall, confidence);
    const isPump = p.link.kind === 'pump';
    const lr: LinkResult = {
      flowM3s: e.q,
      headLossM: isPump ? -(e.pumpHeadM ?? 0) : zu - zd,
      confidence,
      basis: p.model.basis,
    };
    if (e.velocityMs !== undefined) lr.velocityMs = e.velocityMs;
    if (e.regime) lr.regime = e.regime;
    if (isPump) {
      lr.pump = { headM: e.pumpHeadM ?? 0, ...(e.electricalW === undefined ? {} : { watts: e.electricalW }) };
      if (e.electricalW !== undefined && e.electricalW > 0) {
        // Lift actually produced across the pump (level to level), not the curve head.
        const hydraulicW = Math.max(0, density * GRAVITY * e.q * (zd - zu));
        lr.energy = { electricalW: e.electricalW, hydraulicW, flowPerWattM3sPerW: Math.max(0, e.q) / e.electricalW, wireToWater: hydraulicW / e.electricalW };
      }
    }
    links[p.link.id] = lr;

    const name = p.link.name ?? p.link.id;
    if (confidence === 'extrapolated' && p.model.confidence === 'validated') warnings.push({ code: 'outside-validated-range', severity: 'info', targetId: p.link.id, message: `${name}: flow is beyond the curve's last point, so the result is extrapolated` });
    if (e.note === 'pump-starved') warnings.push({ code: 'dry-run', severity: 'critical', targetId: p.link.id, message: `${name}: the level has fallen to the pump intake, so the pump is drawing air and the supply limits the flow` });
    if (e.note === 'pump-dry') warnings.push({ code: 'dry-run', severity: 'critical', targetId: p.link.id, message: `${name}: water level is below the pump intake` });
    if (e.note === 'pump-shutoff') warnings.push({ code: 'no-operating-point', severity: 'critical', targetId: p.link.id, message: `${name}: the pump cannot reach the head this system needs` });
    if (e.note === 'inlet-dry') warnings.push({ code: 'dry-run', severity: 'warning', targetId: p.link.id, message: `${name}: pipe inlet is above the water, so it draws air` });
    if (e.regime === 'drowned') warnings.push({ code: 'drowned-weir', severity: 'info', targetId: p.link.id, message: `${name}: weir is drowned, so the level downstream holds back the flow` });
  }
  for (const l of design.links.filter((l) => l.isolated)) {
    links[l.id] = { flowM3s: 0, headLossM: 0, confidence: 'validated', basis: 'Isolated' };
  }

  const nodes: Record<Id, NodeResult> = {};
  for (const node of design.nodes) {
    const z = level(node.id);
    const nr: NodeResult = { levelM: z, confidence: overall };
    if (node.kind === 'chamber' && z < node.floorM) {
      // With no flow in or out the level is undetermined; report the chamber as empty.
      nr.levelM = node.floorM;
      warnings.push({ code: 'dry-run', severity: 'warning', targetId: node.id, message: `${node.name} has no water in it at this operating point` });
    }
    if (node.kind === 'chamber') {
      nr.freeboardM = z - node.wallCrestM;
      if (z > node.wallCrestM) warnings.push({ code: 'overflow', severity: 'critical', targetId: node.id, message: `${node.name} overflows: level is ${((z - node.wallCrestM) * 1000).toFixed(0)} mm above the wall` });
    }
    nodes[node.id] = nr;
  }

  const criticalPath = findCriticalPath(design, links);
  const budget = budgetFor(criticalPath, links, evals, design);

  let status: SolveResult['status'] = converged ? 'ok' : 'did-not-converge';
  const pumps = prepared.filter((p) => p.link.kind === 'pump');
  if (pumps.length > 0 && pumps.every((p) => Math.abs(evals.get(p.link.id)?.q ?? 0) < 1e-7)) {
    status = 'no-operating-point';
    if (!warnings.some((w) => w.code === 'no-operating-point')) {
      warnings.push({ code: 'no-operating-point', severity: 'critical', message: 'No flow: the pumps cannot reach the head this system needs' });
    }
  }

  return { status, nodes, links, criticalPath, budget, warnings, unsupported: [], iterations, residualM3s };
}

/** The pond-to-pond path along the flow carrying the largest total loss. */
function findCriticalPath(design: Design, links: Record<Id, LinkResult>): Id[] {
  const ponds = new Set(design.nodes.filter((n) => n.kind === 'pond').map((n) => n.id));
  const out = new Map<Id, { link: Id; next: Id; loss: number }[]>();
  for (const l of design.links) {
    const r = links[l.id];
    if (!r || Math.abs(r.flowM3s) < 1e-9) continue;
    const [a, b] = r.flowM3s > 0 ? [l.from, l.to] : [l.to, l.from];
    const loss = l.kind === 'pump' ? 0 : Math.max(0, Math.abs(r.headLossM));
    const list = out.get(a) ?? [];
    list.push({ link: l.id, next: b, loss });
    out.set(a, list);
  }
  let best: { path: Id[]; loss: number } = { path: [], loss: -1 };
  const visit = (node: Id, path: Id[], seen: Set<Id>, loss: number) => {
    for (const e of out.get(node) ?? []) {
      if (ponds.has(e.next)) {
        const total = loss + e.loss;
        if (total > best.loss) best = { path: [...path, e.link], loss: total };
        continue;
      }
      if (seen.has(e.next) || path.length > 200) continue;
      seen.add(e.next);
      visit(e.next, [...path, e.link], seen, loss + e.loss);
      seen.delete(e.next);
    }
  };
  for (const p of ponds) visit(p, [], new Set([p]), 0);
  return best.path;
}

function budgetFor(path: Id[], links: Record<Id, LinkResult>, evals: Map<Id, LinkEval>, design: Design): BudgetEntry[] {
  const kind = new Map(design.links.map((l) => [l.id, l.kind]));
  const entries = path
    // Losses along the flow direction: a link on the path may carry flow to → from.
    .map((id) => ({ id, loss: Math.abs((links[id] as LinkResult).headLossM), e: evals.get(id) }))
    .filter(({ id, loss }) => loss > 0 && kind.get(id) !== 'pump' && kind.get(id) !== 'airlift')
    .map(({ id, loss, e }) => {
      const parts = e?.parts.length ? e.parts.map((p) => ({ ...p, headLossM: Math.abs(p.headLossM) })) : [{ kind: 'opening' as const, label: 'Loss', headLossM: loss }];
      // Link laws report parts that sum to the loss up to the solver tolerance and
      // the tiny regularisation term; rescale only that remainder away.
      const sum = parts.reduce((s, p) => s + p.headLossM, 0);
      const k = sum > 0 ? loss / sum : 1;
      return { linkId: id, headLossM: loss, share: 0, parts: parts.map((p) => ({ ...p, headLossM: p.headLossM * k })) };
    });
  const total = entries.reduce((s, b) => s + b.headLossM, 0);
  for (const b of entries) b.share = total > 0 ? b.headLossM / total : 0;
  return entries.sort((a, b) => b.headLossM - a.headLossM);
}

/** Gaussian elimination with partial pivoting. Returns null if singular. */
function solveLinear(A: Float64Array[], b: Float64Array): Float64Array | null {
  const n = b.length;
  const M: Float64Array[] = A.map((row, i) => {
    const r: Float64Array = new Float64Array(n + 1);
    r.set(row);
    r[n] = b[i] as number;
    return r;
  });
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs((M[r] as Float64Array)[c] as number) > Math.abs((M[piv] as Float64Array)[c] as number)) piv = r;
    const pr = M[piv] as Float64Array;
    if (Math.abs(pr[c] as number) < 1e-300) return null;
    M[piv] = M[c] as Float64Array;
    M[c] = pr;
    const rowC = M[c] as Float64Array;
    for (let r = c + 1; r < n; r++) {
      const row = M[r] as Float64Array;
      const f = (row[c] as number) / (rowC[c] as number);
      if (f === 0) continue;
      for (let k = c; k <= n; k++) row[k] = (row[k] as number) - f * (rowC[k] as number);
    }
  }
  const xOut = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    const row = M[r] as Float64Array;
    let s = row[n] as number;
    for (let k = r + 1; k < n; k++) s -= (row[k] as number) * (xOut[k] as number);
    xOut[r] = s / (row[r] as number);
  }
  return xOut;
}
