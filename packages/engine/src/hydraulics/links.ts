import { fittingLosses } from '../fittings';
import { pipeFriction } from '../friction';
import type { Confidence, GrilleLink, Link, LossPart, OpeningLink, PipeLink, PumpLink, StageLink, ValveLink, WeirLink } from '../model';
import { GRAVITY } from '../water';
import { brent, monotoneCubic } from './curve';

/**
 * Link hydraulics for the network solver.
 *
 * Each link is reduced to a flow law q = F(zUp, zDown) between the heads at its
 * two ends (water level for a free-surface node, piezometric head for a
 * junction). "Resistive" links are defined by a head loss h(q) that rises with
 * flow and are inverted numerically; free-surface links (openings, weirs) and
 * pumps have their own laws.
 */

export interface LinkContext {
  kinematicViscosity: number;
}

export interface LinkEval {
  /** Flow, m³/s, positive from → to. */
  q: number;
  parts: LossPart[];
  velocityMs?: number;
  regime?: 'submerged' | 'free' | 'drowned';
  pumpHeadM?: number;
  /** Set when an end condition matters: e.g. pipe inlet above water. */
  note?: 'inlet-dry' | 'pump-dry' | 'pump-shutoff';
}

export interface LinkModel {
  evaluate(zUp: number, zDown: number): LinkEval;
  confidence: Confidence;
  basis: string;
}

export class UnsupportedLinkError extends Error {
  linkId?: string;
}

// ---------------------------------------------------------------------------
// Resistive links: a loss h(q) > 0 for q > 0, odd in q.
// ---------------------------------------------------------------------------

interface Resistive {
  loss(q: number): { total: number; parts: LossPart[]; velocityMs?: number };
}

/** Invert h(q) = dh for q, by bracketing then Brent. h must be odd and increasing. */
function invertLoss(r: Resistive, dh: number): number {
  if (dh === 0) return 0;
  const target = Math.abs(dh);
  let hi = 1e-4;
  while (r.loss(hi).total < target) {
    hi *= 2;
    if (hi > 1e3) throw new RangeError('Flow out of range');
  }
  const q = brent((x) => r.loss(x).total - target, 0, hi, 1e-13);
  return Math.sign(dh) * q;
}

/**
 * A resistive law between two heads. Pipe ends can sit above the water: an
 * end in air contributes its elevation instead of the water level, and water
 * cannot flow back into an end that is in air.
 */
function resistiveModel(r: Resistive, ends?: { inletM: number; outletM: number }): (zu: number, zd: number) => LinkEval {
  return (zu, zd) => {
    let dh: number;
    if (!ends) dh = zu - zd;
    else {
      const forward = zu - Math.max(zd, ends.outletM);
      const reverse = zd - Math.max(zu, ends.inletM);
      if (forward > 0 && zu > ends.inletM) dh = forward;
      else if (reverse > 0 && zd > ends.outletM) dh = -reverse;
      else return { q: 0, parts: [], ...(zu <= ends.inletM && zu > zd ? { note: 'inlet-dry' as const } : {}) };
    }
    const q = invertLoss(r, dh);
    const l = r.loss(Math.abs(q));
    const sign = Math.sign(q) || 1;
    const out: LinkEval = { q, parts: l.parts.map((p) => ({ ...p, headLossM: p.headLossM * sign })) };
    if (l.velocityMs !== undefined) out.velocityMs = sign * l.velocityMs;
    return out;
  };
}

function pipeLoss(link: Pick<PipeLink, 'internalDiameterM' | 'lengthM' | 'roughnessM' | 'fittings' | 'parallelCount'>, ctx: LinkContext): Resistive {
  const n = Math.max(1, link.parallelCount ?? 1);
  const dmm = Math.round(link.internalDiameterM * 1000);
  return {
    loss(q) {
      const qEach = Math.abs(q) / n;
      const fr = pipeFriction({
        diameterM: link.internalDiameterM,
        lengthM: link.lengthM,
        roughnessM: link.roughnessM,
        flowM3s: qEach,
        kinematicViscosity: ctx.kinematicViscosity,
      });
      const parts: LossPart[] = [
        { kind: 'friction', label: `Friction, ${link.lengthM} m of ${dmm} mm bore${n > 1 ? ` (${n} in parallel)` : ''}`, headLossM: fr.frictionLossM },
      ];
      for (const f of fittingLosses(link.fittings, fr.reynolds, link.internalDiameterM, fr.velocityHeadM)) {
        const kind = f.type.startsWith('entrance') || f.type === 'bottom-drain-dome' ? 'entrance' : f.type === 'exit' ? 'exit' : 'fitting';
        parts.push({ kind, label: f.estimate ? `${f.label} (estimate)` : f.label, headLossM: f.headLossM });
      }
      return { total: parts.reduce((s, p) => s + p.headLossM, 0), parts, velocityMs: fr.velocityMs };
    },
  };
}

// ---------------------------------------------------------------------------
// Openings: integrate orifice flow over the opening height so the law is
// continuous through free, partly submerged and fully submerged states.
// ---------------------------------------------------------------------------

const DEFAULT_CD_OPENING = 0.61;

function openingFlow(link: OpeningLink, zu: number, zd: number): LinkEval {
  const forward = zu >= zd;
  const hiZ = forward ? zu : zd;
  const loZ = forward ? zd : zu;
  const cd = link.dischargeCoefficient ?? DEFAULT_CD_OPENING;
  const count = link.count ?? 1;
  // Circular openings are treated as the square of equal area (approximation).
  const width = link.shape.type === 'rect' ? link.shape.widthM : Math.sqrt((Math.PI / 4) * link.shape.diameterM ** 2);
  const height = link.shape.type === 'rect' ? link.shape.heightM : width;
  const bottom = link.invertM;
  const top = bottom + height;
  const k = cd * width * Math.sqrt(2 * GRAVITY) * count;
  // Free part: from max(bottom, loZ) up to min(top, hiZ), each strip at head (hiZ − z).
  const fa = Math.max(bottom, loZ);
  const fb = Math.min(top, hiZ);
  let q = 0;
  if (fb > fa) q += k * (2 / 3) * ((hiZ - fa) ** 1.5 - (hiZ - fb) ** 1.5);
  // Submerged part: from bottom up to min(top, loZ), all strips at head (hiZ − loZ).
  const sb = Math.min(top, loZ);
  if (sb > bottom && hiZ > loZ) q += k * (sb - bottom) * Math.sqrt(hiZ - loZ);
  const regime: LinkEval['regime'] = loZ <= bottom ? 'free' : 'submerged';
  const signed = forward ? q : -q;
  const area = width * height * count;
  return {
    q: signed,
    regime,
    velocityMs: signed / area,
    parts: q > 0 ? [{ kind: 'opening', label: 'Opening', headLossM: forward ? zu - zd : zd - zu }] : [],
  };
}

// ---------------------------------------------------------------------------
// Weirs: sharp-crested rectangular weir, Villemonte (1947) drowned correction.
// ---------------------------------------------------------------------------

const WEIR_CE = 0.62;

function weirFlow(link: WeirLink, zu: number, zd: number): LinkEval {
  const crest = link.standpipe?.fitted ? link.standpipe.fittedCrestM : link.crestM;
  const forward = zu >= zd;
  const h1 = (forward ? zu : zd) - crest;
  const h2 = (forward ? zd : zu) - crest;
  if (h1 <= 0) return { q: 0, parts: [], regime: 'free' };
  const free = WEIR_CE * (2 / 3) * Math.sqrt(2 * GRAVITY) * link.widthM * h1 ** 1.5;
  let q = free;
  let regime: LinkEval['regime'] = 'free';
  if (h2 > 0) {
    q = free * Math.max(0, 1 - (h2 / h1) ** 1.5) ** 0.385;
    regime = 'drowned';
  }
  return {
    q: forward ? q : -q,
    regime,
    parts: [{ kind: 'weir', label: 'Weir', headLossM: Math.abs(zu - zd) }],
  };
}

// ---------------------------------------------------------------------------
// Grilles: Kirschmer (1926) bar-rack loss, Δh = β (t/b)^(4/3) sin θ · v²/2g.
// ---------------------------------------------------------------------------

function grilleLoss(link: GrilleLink): Resistive {
  const open = link.faceAreaM2 * (1 - Math.min(0.95, Math.max(0, link.blockedFraction)));
  const kRack = link.shapeFactor * (link.barThicknessM / link.barSpacingM) ** (4 / 3) * Math.sin((link.angleDeg * Math.PI) / 180);
  return {
    loss(q) {
      const v = Math.abs(q) / open;
      // Blockage also raises the loss through the remaining open area.
      const h = (kRack * v * v) / (2 * GRAVITY);
      return { total: h, velocityMs: v, parts: [{ kind: 'grille', label: 'Grille', headLossM: h }] };
    },
  };
}

// ---------------------------------------------------------------------------
// Valves: open valves use the fitting coefficients; part-open is an estimate.
// ---------------------------------------------------------------------------

function valveLoss(link: ValveLink, ctx: LinkContext): Resistive {
  const type = link.valveType === 'ball' ? 'ball-valve' : 'gate-valve';
  const base = pipeLoss({ internalDiameterM: link.internalDiameterM, lengthM: 0, roughnessM: 0, fittings: [{ type, count: 1 }] }, ctx);
  const open = Math.min(1, Math.max(0.02, link.openFraction));
  // Estimate: loss scales with (1/open)². Real part-open curves are valve specific.
  const scale = 1 / (open * open);
  return {
    loss(q) {
      const l = base.loss(q);
      const parts = l.parts.filter((p) => p.headLossM !== 0).map((p) => ({ ...p, kind: 'valve' as const, headLossM: p.headLossM * scale, label: open < 1 ? `${p.label} at ${Math.round(open * 100)}% (estimate)` : p.label }));
      return { total: parts.reduce((s, p) => s + p.headLossM, 0), parts, ...(l.velocityMs === undefined ? {} : { velocityMs: l.velocityMs }) };
    },
  };
}

// ---------------------------------------------------------------------------
// Stages: in milestone 1 only generic stages and measured curves.
// ---------------------------------------------------------------------------

function stageLoss(link: StageLink): Resistive {
  if (link.measured && link.measured.points.length > 0) {
    const pts = [...link.measured.points].sort((a, b) => a.flowM3s - b.flowM3s);
    const withZero = pts[0]?.flowM3s === 0 ? pts : [{ flowM3s: 0, headLossM: 0 }, ...pts];
    if (withZero.length === 2) {
      // One measured point: assume loss ∝ q² (turbulent) through it.
      const p = withZero[1] as { flowM3s: number; headLossM: number };
      const c = p.headLossM / p.flowM3s ** 2;
      return { loss: (q) => ({ total: c * q * q, parts: [{ kind: 'media', label: 'Measured head loss', headLossM: c * q * q }] }) };
    }
    const curve = monotoneCubic(withZero.map((p) => p.flowM3s), withZero.map((p) => p.headLossM));
    return {
      loss(q) {
        const x = Math.abs(q);
        let h = curve.at(x);
        if (x > curve.xMax) {
          // Beyond the data, extend as q² from the last point.
          const last = withZero.at(-1) as { flowM3s: number; headLossM: number };
          h = last.headLossM * (x / last.flowM3s) ** 2;
        }
        h = Math.max(h, 0);
        return { total: h, parts: [{ kind: 'media', label: 'Measured head loss', headLossM: h }] };
      },
    };
  }
  const s = link.stage;
  if (s.type === 'generic') {
    return {
      loss(q) {
        let h = 0;
        if (s.k !== undefined && s.referenceAreaM2) {
          const v = Math.abs(q) / s.referenceAreaM2;
          h += (s.k * v * v) / (2 * GRAVITY);
        }
        // A fixed loss only applies with flow; ramp it in over a tiny flow so the law stays continuous.
        if (s.fixedHeadLossM) h += s.fixedHeadLossM * Math.min(1, Math.abs(q) / 1e-5);
        return { total: h, parts: [{ kind: 'media', label: 'Stage', headLossM: h }] };
      },
    };
  }
  throw new UnsupportedLinkError(`Stage type "${s.type}" arrives in milestone 4; give it a measured curve to use it now.`);
}

// ---------------------------------------------------------------------------
// Pumps
// ---------------------------------------------------------------------------

function pumpModel(link: PumpLink): LinkModel {
  const s = Math.max(0.05, link.speedFraction);
  const pts = [...link.curve].sort((a, b) => a.flowM3s - b.flowM3s);
  if (pts.length < 2) throw new UnsupportedLinkError('A pump needs at least two curve points');
  const curve = monotoneCubic(pts.map((p) => p.flowM3s), pts.map((p) => p.headM));
  // Affinity laws: H(q, s) = s² H₀(q/s).
  const head = (q: number) => s * s * curve.at(q / s);
  const shutoff = head(0);
  // Find where the (extrapolated) curve reaches zero head.
  let qMax = (pts.at(-1)?.flowM3s ?? 0.01) * s;
  while (head(qMax) > 0) qMax *= 1.5;
  return {
    confidence: 'validated',
    basis: 'Manufacturer pump curve (monotone cubic), affinity laws for speed',
    evaluate(zu, zd) {
      if (zu < link.intakeElevationM) return { q: 0, parts: [], note: 'pump-dry', pumpHeadM: 0 };
      const lift = zd - zu;
      if (lift >= shutoff) return { q: 0, parts: [], note: 'pump-shutoff', pumpHeadM: shutoff };
      if (lift <= head(qMax)) return { q: qMax, parts: [], pumpHeadM: head(qMax) };
      const q = brent((x) => head(x) - lift, 0, qMax, 1e-13);
      return { q, parts: [], pumpHeadM: head(q) };
    },
  };
}

// ---------------------------------------------------------------------------

export function linkModel(link: Link, ctx: LinkContext): LinkModel {
  try {
    return linkModelInner(link, ctx);
  } catch (e) {
    if (e instanceof UnsupportedLinkError) e.linkId = link.id;
    throw e;
  }
}

function linkModelInner(link: Link, ctx: LinkContext): LinkModel {
  switch (link.kind) {
    case 'pipe': {
      const r = pipeLoss(link, ctx);
      // A pipe discharging above the water downstream sees its outlet elevation, not the level.
      const evalFn = resistiveModel(r, { inletM: link.inletElevationM, outletM: link.outletElevationM });
      return { evaluate: evalFn, confidence: 'validated', basis: 'Darcy-Weisbach, Colebrook-White, Darby 3-K fittings' };
    }
    case 'opening':
      return { evaluate: (zu, zd) => openingFlow(link, zu, zd), confidence: 'validated', basis: 'Orifice flow integrated over the opening, Cd 0.61' };
    case 'weir':
      return { evaluate: (zu, zd) => weirFlow(link, zu, zd), confidence: 'validated', basis: 'Sharp-crested weir, Villemonte drowned correction' };
    case 'grille': {
      const r = grilleLoss(link);
      return { evaluate: resistiveModel(r), confidence: 'validated', basis: 'Kirschmer bar-rack loss' };
    }
    case 'valve': {
      const r = valveLoss(link, ctx);
      return { evaluate: resistiveModel(r), confidence: link.openFraction >= 1 ? 'validated' : 'unvalidated', basis: 'Darby 3-K; part-open scaling is an estimate' };
    }
    case 'stage': {
      const r = stageLoss(link);
      return { evaluate: resistiveModel(r), confidence: link.measured ? 'validated' : 'extrapolated', basis: link.measured ? 'Your measured head-loss curve' : 'Generic loss coefficient' };
    }
    case 'pump':
      return pumpModel(link);
    case 'airlift':
      throw new UnsupportedLinkError('The airlift model arrives in milestone 3.');
  }
}
