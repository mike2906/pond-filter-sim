/**
 * PREVIEW SOLVER — placeholder maths so the designer can be built and tried
 * before the milestone-1 network solver exists. It is deliberately simple and
 * NOT the engine:
 *
 * - Flow splits equally at every branch instead of balancing heads.
 * - Media, brushes and other stages use rough linear resistances.
 * - Airlifts use a made-up straight-line curve from air flow.
 *
 * The UI labels every result from here as a preview. When `solve` from
 * @pond/engine stops throwing, the worker uses it instead and this file can go.
 */
import {
  GRAVITY,
  waterKinematicViscosity,
  type BudgetEntry,
  type Design,
  type FittingType,
  type Id,
  type Link,
  type LinkResult,
  type LossPart,
  type NodeResult,
  type SolveResult,
  type Stage,
  type Warning,
} from '@pond/engine';

const FITTING_K: Record<FittingType, number> = {
  'elbow-90-short': 0.9,
  'elbow-90-long': 0.45,
  'elbow-45': 0.35,
  'tee-run': 0.4,
  'tee-branch': 1.5,
  'ball-valve': 0.1,
  'gate-valve': 0.2,
  'check-valve': 2.0,
  'entrance-sharp': 0.5,
  'entrance-flush': 0.5,
  'entrance-bellmouth': 0.05,
  exit: 1.0,
  'bottom-drain-dome': 1.5,
};

export const FITTING_LABEL: Record<FittingType, string> = {
  'elbow-90-short': 'short 90° elbow',
  'elbow-90-long': 'long-radius 90° bend',
  'elbow-45': '45° bend',
  'tee-run': 'tee, through run',
  'tee-branch': 'tee, through branch',
  'ball-valve': 'ball valve (open)',
  'gate-valve': 'gate valve (open)',
  'check-valve': 'check valve',
  'entrance-sharp': 'sharp entrance',
  'entrance-flush': 'flush entrance',
  'entrance-bellmouth': 'bellmouth entrance',
  exit: 'exit into chamber',
  'bottom-drain-dome': 'bottom drain dome',
};

const PREVIEW_BASIS = 'Preview approximation, not the engine';

const vHead = (v: number) => (v * v) / (2 * GRAVITY);
const circleArea = (d: number) => (Math.PI * d * d) / 4;

interface LinkLoss {
  headLossM: number;
  velocityMs?: number;
  parts: LossPart[];
}

function pipeLoss(l: Extract<Link, { kind: 'pipe' }>, q: number, nu: number): LinkLoss {
  const n = Math.max(1, l.parallelCount ?? 1);
  const a = circleArea(l.internalDiameterM);
  const v = q / n / a;
  const re = (Math.abs(v) * l.internalDiameterM) / nu;
  let f: number;
  if (re < 1) f = 0;
  else if (re < 2300) f = 64 / re;
  else {
    // Swamee–Jain explicit approximation to Colebrook.
    const t = Math.log10(l.roughnessM / (3.7 * l.internalDiameterM) + 5.74 / re ** 0.9);
    f = 0.25 / (t * t);
  }
  const hv = vHead(v);
  const parts: LossPart[] = [
    {
      kind: 'friction',
      label: `Friction, ${l.lengthM.toFixed(1)} m of ${(l.internalDiameterM * 1000).toFixed(0)} mm bore`,
      headLossM: (f * l.lengthM * hv) / l.internalDiameterM,
    },
  ];
  for (const ft of l.fittings) {
    if (ft.count <= 0) continue;
    const kind: LossPart['kind'] = ft.type === 'exit' ? 'exit' : ft.type.startsWith('entrance') ? 'entrance' : 'fitting';
    parts.push({ kind, label: `${ft.count} × ${FITTING_LABEL[ft.type]}`, headLossM: ft.count * FITTING_K[ft.type] * hv });
  }
  return { headLossM: sum(parts), velocityMs: v, parts };
}

function stageResistance(stage: Stage, q: number): { area: number; loss: number; label: string } {
  // Linear-in-velocity placeholder resistances (s/m per metre of depth).
  const geomArea = (g: { type: 'planar'; flowAreaM2: number } | { type: 'radial'; innerRadiusM: number; activeHeightM: number }) =>
    g.type === 'planar' ? g.flowAreaM2 : 2 * Math.PI * g.innerRadiusM * g.activeHeightM;
  const geomDepth = (g: { type: 'planar'; depthM: number } | { type: 'radial'; outerRadiusM: number; innerRadiusM: number }) =>
    g.type === 'planar' ? g.depthM : g.outerRadiusM - g.innerRadiusM;
  switch (stage.type) {
    case 'matting': {
      const a = geomArea(stage.geometry);
      return { area: a, loss: 3.5 * geomDepth(stage.geometry) * (q / a), label: 'Matting (preview resistance)' };
    }
    case 'static-media': {
      const a = geomArea(stage.geometry);
      return { area: a, loss: 2 * geomDepth(stage.geometry) * (q / a), label: 'Static media (preview resistance)' };
    }
    case 'gravel-bed': {
      const a = geomArea(stage.geometry);
      return { area: a, loss: 30 * geomDepth(stage.geometry) * (q / a), label: 'Gravel bed (preview resistance)' };
    }
    case 'beads': {
      const v = q / stage.bedAreaM2;
      return { area: stage.bedAreaM2, loss: 140 * stage.bedDepthM * v + stage.valveK * vHead(v), label: 'Bead bed and valve (preview)' };
    }
    case 'brushes': {
      const a = Math.max(0.01, stage.lengthM * stage.brushDiameterM * stage.count);
      return { area: a, loss: 0.3 * stage.rows * (q / a), label: 'Brushes (preview resistance)' };
    }
    case 'sieve': {
      const a = Math.max(0.001, stage.widthM * 0.3 * stage.openAreaFraction);
      return { area: a, loss: 1.5 * vHead(q / a), label: 'Sieve screen (preview)' };
    }
    case 'drum': {
      const a = Math.max(0.001, stage.screenAreaM2 * stage.openAreaFraction);
      return { area: a, loss: 1.5 * vHead(q / a), label: 'Drum screen (preview)' };
    }
    case 'moving-bed': {
      const a = Math.max(0.001, stage.screenAreaM2 * stage.screenOpenFraction);
      return { area: a, loss: 1.5 * vHead(q / a), label: 'Moving-bed outlet screen (preview)' };
    }
    case 'vortex': {
      const a = circleArea(stage.diameterM);
      return { area: a, loss: 0.002, label: 'Vortex (preview, fixed)' };
    }
    case 'settlement':
      return { area: 1, loss: 0.0005 * stage.baffles, label: 'Settlement baffles (preview)' };
    case 'generic': {
      const a = stage.referenceAreaM2 ?? 1;
      return { area: a, loss: (stage.fixedHeadLossM ?? 0) + (stage.k ?? 0) * vHead(q / a), label: 'Generic element' };
    }
  }
}

function interpolate(points: { x: number; y: number }[], x: number): number {
  const p = [...points].sort((a, b) => a.x - b.x);
  if (p.length === 0) return 0;
  if (p.length === 1) return p[0]!.y;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]!;
    const b = p[i]!;
    if (x <= b.x || i === p.length - 1) {
      const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
      return a.y + t * (b.y - a.y);
    }
  }
  return p[p.length - 1]!.y;
}

function passiveLoss(l: Link, q: number, nu: number): LinkLoss {
  const aq = Math.abs(q);
  switch (l.kind) {
    case 'pipe':
      return pipeLoss(l, aq, nu);
    case 'opening': {
      const a = (l.shape.type === 'circle' ? circleArea(l.shape.diameterM) : l.shape.widthM * l.shape.heightM) * (l.count ?? 1);
      const cd = l.dischargeCoefficient ?? 0.61;
      const v = aq / a;
      const h = vHead(aq / (cd * a));
      return { headLossM: h, velocityMs: v, parts: [{ kind: 'opening', label: 'Orifice loss', headLossM: h }] };
    }
    case 'weir': {
      // Francis: Q = 1.84 W H^1.5. In the preview the head over the crest is treated as the loss.
      const h = (aq / (1.84 * l.widthM)) ** (2 / 3);
      return { headLossM: h, parts: [{ kind: 'weir', label: 'Head over weir crest', headLossM: h }] };
    }
    case 'grille': {
      const v = aq / (l.faceAreaM2 * Math.max(0.05, 1 - l.blockedFraction));
      const h = l.shapeFactor * (l.barThicknessM / l.barSpacingM) ** (4 / 3) * vHead(v) * Math.sin((l.angleDeg * Math.PI) / 180);
      return { headLossM: h, velocityMs: v, parts: [{ kind: 'grille', label: 'Bar screen (Kirschmer)', headLossM: h }] };
    }
    case 'valve': {
      const v = aq / circleArea(l.internalDiameterM);
      const k0 = { ball: 0.1, gate: 0.2, butterfly: 0.5, slide: 0.3 }[l.valveType];
      const open = Math.max(0.02, l.openFraction);
      const h = (k0 / (open * open)) * vHead(v);
      return { headLossM: h, velocityMs: v, parts: [{ kind: 'valve', label: `${l.valveType} valve, ${Math.round(open * 100)}% open`, headLossM: h }] };
    }
    case 'stage': {
      const parts: LossPart[] = [];
      let area = 1;
      if (l.measured && l.measured.points.length > 0) {
        const h = interpolate(l.measured.points.map((p) => ({ x: p.flowM3s, y: p.headLossM })), aq);
        parts.push({ kind: 'media', label: 'Measured curve', headLossM: h });
      } else {
        const r = stageResistance(l.stage, aq);
        area = r.area;
        parts.push({ kind: 'media', label: r.label, headLossM: r.loss });
      }
      for (const [i, s] of (l.screens ?? []).entries()) {
        const a = s.openAreaM2 * Math.max(0.05, 1 - (s.blockedFraction ?? 0));
        parts.push({ kind: 'screen', label: `Retaining screen ${i + 1}`, headLossM: vHead(aq / ((s.dischargeCoefficient ?? 0.61) * a)) });
      }
      return { headLossM: sum(parts), velocityMs: aq / area, parts };
    }
    case 'pump':
    case 'airlift':
      return { headLossM: 0, parts: [] };
  }
}

/** Air flow in L/min; an air-pump curve uses its free-flow point. */
function airLpm(l: Extract<Link, { kind: 'airlift' }>): number {
  const m3s = l.airSupply.type === 'fixed' ? l.airSupply.airFlowM3s : Math.max(0, ...l.airSupply.curve.map((p) => p.airFlowM3s));
  return m3s * 60000;
}

/** Head a driver adds at flow q (m). */
function driverHead(l: Link, q: number): number {
  if (l.kind === 'pump') {
    const s = Math.max(0.05, l.speedFraction);
    const pts = l.curve.map((p) => ({ x: p.flowM3s, y: p.headM }));
    return s * s * interpolate(pts, q / s);
  }
  if (l.kind === 'airlift') {
    const air = airLpm(l);
    const count = l.count ?? 1;
    const qMax = ((0.25 * air) / 3600) * count * airliftScale; // m³/s at zero lift — invented for the preview
    const h0 = 0.12;
    return Math.max(0, h0 * (1 - q / Math.max(1e-9, qMax)));
  }
  return 0;
}

/** Largest flow a driver can produce (head 0), used to bracket the search. */
function driverMaxFlow(l: Link): number {
  if (l.kind === 'pump') return Math.max(...l.curve.map((p) => p.flowM3s), 0) * Math.max(0.05, l.speedFraction);
  if (l.kind === 'airlift') {
    const air = airLpm(l);
    return ((0.25 * air) / 3600) * (l.count ?? 1) * airliftScale;
  }
  return 0;
}

let airliftScale = 1;

const isDriver = (l: Link) => l.kind === 'pump' || l.kind === 'airlift';
const sum = (parts: { headLossM: number }[]) => parts.reduce((s, p) => s + p.headLossM, 0);

function fail(status: SolveResult['status'], message: string, warnings: Warning[] = []): SolveResult {
  return {
    status,
    nodes: {},
    links: {},
    criticalPath: [],
    budget: [],
    warnings: [...warnings, { code: 'no-operating-point', severity: 'critical', message }],
    iterations: 0,
    residualM3s: Number.NaN,
  };
}

export interface PreviewOptions {
  /** Scales the placeholder airlift capacity, to give the preview a low/high band. */
  airliftScale?: number;
}

export function previewSolve(design: Design, opts: PreviewOptions = {}): SolveResult {
  airliftScale = opts.airliftScale ?? 1;
  const nu = waterKinematicViscosity(design.water.tempC);
  const nodes = new Map(design.nodes.map((n) => [n.id, n]));
  const ponds = design.nodes.filter((n) => n.kind === 'pond');
  if (ponds.length === 0) return fail('invalid-design', 'A design needs a pond.');
  const links = design.links.filter((l) => !l.isolated && nodes.has(l.from) && nodes.has(l.to));
  const drivers = links.filter(isDriver);
  if (drivers.length === 0) return fail('no-operating-point', 'Nothing moves water: add a pump or an airlift.');

  // Topological order over the graph with edges into ponds cut (ponds are sources and sinks).
  const out = new Map<Id, Link[]>();
  const indeg = new Map<Id, number>();
  for (const n of design.nodes) {
    out.set(n.id, []);
    indeg.set(n.id, 0);
  }
  for (const l of links) {
    out.get(l.from)!.push(l);
    if (nodes.get(l.to)!.kind !== 'pond') indeg.set(l.to, (indeg.get(l.to) ?? 0) + 1);
  }
  const order: Id[] = [];
  const queue = design.nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const l of out.get(id)!) {
      if (nodes.get(l.to)!.kind === 'pond') continue;
      const d = (indeg.get(l.to) ?? 0) - 1;
      indeg.set(l.to, d);
      if (d === 0) queue.push(l.to);
    }
  }
  if (order.length < design.nodes.length) {
    return fail('invalid-design', 'The preview solver needs flow to run one way from pond back to pond (it found a loop).');
  }

  const pondOut = ponds.flatMap((p) => out.get(p.id)!);
  if (pondOut.length === 0) return fail('invalid-design', 'Nothing leaves the pond.');

  /** Equal-split flows for a total Q leaving the ponds. */
  const distribute = (qTotal: number) => {
    const inflow = new Map<Id, number>();
    const flows = new Map<Id, number>();
    for (const id of order) {
      const n = nodes.get(id)!;
      const outs = out.get(id)!;
      if (outs.length === 0) continue;
      const qIn = n.kind === 'pond' ? (qTotal * outs.length) / pondOut.length : (inflow.get(id) ?? 0);
      const each = qIn / outs.length;
      for (const l of outs) {
        flows.set(l.id, each);
        if (nodes.get(l.to)!.kind !== 'pond') inflow.set(l.to, (inflow.get(l.to) ?? 0) + each);
      }
    }
    return flows;
  };

  /** Loop head-loss excess: passive losses on the worst loop minus driver head. */
  const evaluate = (qTotal: number) => {
    const flows = distribute(qTotal);
    const losses = new Map<Id, LinkLoss>();
    for (const l of links) losses.set(l.id, passiveLoss(l, flows.get(l.id) ?? 0, nu));
    // Longest (most-loss) path from any pond to any pond; drivers count as negative loss.
    const best = new Map<Id, { cost: number; path: Id[] }>();
    for (const p of ponds) best.set(p.id, { cost: 0, path: [] });
    let worst: { cost: number; path: Id[]; driverHead: number } | null = null;
    for (const id of order) {
      const here = best.get(id);
      if (!here) continue;
      for (const l of out.get(id)!) {
        const q = flows.get(l.id) ?? 0;
        const cost = here.cost + (isDriver(l) ? 0 : losses.get(l.id)!.headLossM);
        const path = [...here.path, l.id];
        if (nodes.get(l.to)!.kind === 'pond') {
          const dh = path.reduce((s, lid) => {
            const link = links.find((x) => x.id === lid)!;
            return s + (isDriver(link) ? driverHead(link, flows.get(lid) ?? q) : 0);
          }, 0);
          const net = cost - dh;
          if (!worst || net > worst.cost - worst.driverHead) worst = { cost, path, driverHead: dh };
        } else {
          const prev = best.get(l.to);
          if (!prev || cost > prev.cost) best.set(l.to, { cost, path });
        }
      }
    }
    return { flows, losses, worst };
  };

  const qMax = Math.max(...drivers.map(driverMaxFlow)) * drivers.length;
  if (!(qMax > 0)) return fail('no-operating-point', 'The pump or airlift has no flow at zero head.');

  // Bisection on total flow: find Q where driver head equals loop loss.
  let lo = 0;
  let hi = qMax;
  let iterations = 0;
  const excess = (q: number) => {
    const w = evaluate(q).worst;
    return w ? w.cost - w.driverHead : 1;
  };
  if (excess(1e-7) > 0) {
    return fail('no-operating-point', 'The pump or airlift cannot overcome the losses even at almost no flow.');
  }
  for (; iterations < 60; iterations++) {
    const mid = (lo + hi) / 2;
    if (excess(mid) > 0) hi = mid;
    else lo = mid;
    if (hi - lo < 1e-8) break;
  }
  const qTotal = (lo + hi) / 2;
  const { flows, losses, worst } = evaluate(qTotal);

  // Levels: forward from ponds through passive links until a driver, backward from ponds the same way.
  const fwd = new Map<Id, number>();
  for (const p of ponds) fwd.set(p.id, p.kind === 'pond' ? p.levelM : 0);
  for (const id of order) {
    const lv = fwd.get(id);
    if (lv === undefined) continue;
    for (const l of out.get(id)!) {
      if (isDriver(l) || nodes.get(l.to)!.kind === 'pond') continue;
      const next = lv - losses.get(l.id)!.headLossM;
      fwd.set(l.to, Math.min(fwd.get(l.to) ?? Infinity, next));
    }
  }
  const back = new Map<Id, number>();
  for (const id of [...order].reverse()) {
    for (const l of out.get(id)!) {
      if (isDriver(l)) continue;
      const to = nodes.get(l.to)!;
      const downstream = to.kind === 'pond' ? to.levelM : back.get(l.to);
      if (downstream === undefined) continue;
      const lv = downstream + losses.get(l.id)!.headLossM;
      back.set(id, Math.max(back.get(id) ?? -Infinity, lv));
    }
  }

  const nodeResults: Record<Id, NodeResult> = {};
  const warnings: Warning[] = [];
  for (const n of design.nodes) {
    if (n.kind === 'pond') {
      nodeResults[n.id] = { levelM: n.levelM, confidence: 'validated' };
      continue;
    }
    const level = fwd.get(n.id) ?? back.get(n.id);
    if (level === undefined) continue;
    if (n.kind === 'chamber') {
      const freeboard = level - n.wallCrestM;
      nodeResults[n.id] = { levelM: level, freeboardM: freeboard, confidence: 'unvalidated' };
      if (freeboard > 0) warnings.push({ code: 'overflow', severity: 'critical', targetId: n.id, message: `${n.name} overflows its wall by ${(freeboard * 100).toFixed(1)} cm.` });
      else if (freeboard > -0.02) warnings.push({ code: 'overflow', severity: 'warning', targetId: n.id, message: `${n.name} is within 2 cm of overflowing.` });
      if (level < n.floorM + 0.05) warnings.push({ code: 'dry-run', severity: 'critical', targetId: n.id, message: `${n.name} is drawn down almost to its floor.` });
    } else {
      nodeResults[n.id] = { levelM: level, confidence: 'unvalidated' };
    }
  }

  const linkResults: Record<Id, LinkResult> = {};
  for (const l of design.links) {
    if (l.isolated || !flows.has(l.id)) {
      linkResults[l.id] = { flowM3s: 0, headLossM: 0, confidence: 'unvalidated', basis: PREVIEW_BASIS };
      continue;
    }
    const q = flows.get(l.id)!;
    if (isDriver(l)) {
      const h = driverHead(l, q);
      linkResults[l.id] = { flowM3s: q, headLossM: -h, confidence: 'unvalidated', basis: l.kind === 'pump' ? 'Pump curve, affinity laws (preview)' : 'Placeholder airlift line (preview)', ...(l.kind === 'pump' ? { pump: { headM: h } } : {}) };
      if (l.kind === 'airlift') {
        linkResults[l.id]!.airlift = { airFlowM3s: airLpm(l) / 60000, injectionPressurePa: 0, efficiency: Number.NaN };
        warnings.push({ code: 'outside-validated-range', severity: 'info', targetId: l.id, message: 'Airlift performance in the preview is a placeholder line, not a model. Real airlift physics arrives in milestone 3.' });
      }
      continue;
    }
    const loss = losses.get(l.id)!;
    linkResults[l.id] = { flowM3s: q, headLossM: loss.headLossM, confidence: 'unvalidated', basis: l.kind === 'pipe' ? 'Darcy-Weisbach, Swamee-Jain, fixed K (preview)' : PREVIEW_BASIS, ...(loss.velocityMs !== undefined ? { velocityMs: loss.velocityMs } : {}) };
    if (l.kind === 'pipe') {
      const pressurised = nodes.get(l.from)?.kind === 'junction';
      const v = loss.velocityMs ?? 0;
      if (!pressurised && v > 1.0) {
        warnings.push({ code: 'velocity-high', severity: 'warning', targetId: l.id, message: `${l.name ?? 'Pipe'} runs at ${v.toFixed(2)} m/s; gravity lines are usually kept under about 1 m/s.` });
      } else if (pressurised && v > 2.5) {
        warnings.push({ code: 'velocity-high', severity: 'warning', targetId: l.id, message: `${l.name ?? 'Pipe'} runs at ${v.toFixed(2)} m/s; pumped lines are usually kept under about 2 m/s to limit losses.` });
      }
    }
  }

  const path = worst?.path ?? [];
  const passivePath = path.filter((id) => !isDriver(links.find((l) => l.id === id)!));
  const total = passivePath.reduce((s, id) => s + losses.get(id)!.headLossM, 0);
  const budget: BudgetEntry[] = passivePath
    .map((id) => {
      const loss = losses.get(id)!;
      return { linkId: id, headLossM: loss.headLossM, share: total > 0 ? loss.headLossM / total : 0, parts: loss.parts };
    })
    .sort((a, b) => b.headLossM - a.headLossM);

  return {
    status: 'ok',
    nodes: nodeResults,
    links: linkResults,
    criticalPath: path,
    budget,
    warnings,
    iterations,
    residualM3s: 0,
  };
}
