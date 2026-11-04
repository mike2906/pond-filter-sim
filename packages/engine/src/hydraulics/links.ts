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
  /** Electrical input at this flow, W, when known. */
  electricalW?: number;
  /** Set when an end condition matters: e.g. pipe inlet above water. */
  note?: 'inlet-dry' | 'pump-dry' | 'pump-starved' | 'pump-shutoff';
}

export interface LinkModel {
  evaluate(zUp: number, zDown: number): LinkEval;
  confidence: Confidence;
  /** Confidence at a particular flow, when it depends on flow (e.g. beyond measured data). */
  confidenceAt?: (q: number) => Confidence;
  basis: string;
}

/** A component the engine cannot model yet (a later milestone). Not a design error. */
export class UnsupportedLinkError extends Error {
  linkId?: string;
}

/**
 * C¹ ramp from 0 at x ≤ 0 to 1 at x ≥ 1. Used to fade flow in as a level rises
 * past a pipe inlet or pump intake, so the solver never sees a step. Physically
 * this stands in for the vortexing and air drawing that cut flow as an inlet
 * nears the surface; it acts over RAMP_M only and is a numerical regularisation.
 */
function smoothstep(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}
const RAMP_M = 0.005;

/**
 * Small linear term added to every resistive loss (m per m³/s) so h(q) is
 * strictly increasing and unbounded: the inversion always has a root, even for
 * a stage with zero loss. 1e-4 m per m³/s is 3 µm at 100 m³/h.
 */
const REGULARISATION_M_PER_M3S = 1e-4;

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
  const h = (x: number) => r.loss(x).total + REGULARISATION_M_PER_M3S * x;
  let hi = 1e-4;
  // With the linear term h(1e7) ≥ 1000 m, so this always brackets a physical head.
  while (h(hi) < target && hi < 1e7) hi *= 2;
  const q = brent((x) => h(x) - target, 0, hi, 1e-13);
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
    /** Fade-in as the supplying level rises past the end it drains through. */
    let ramp = 1;
    /** Free fall from an end in air down to the receiving water. */
    let drop = 0;
    if (!ends) dh = zu - zd;
    else {
      const forward = zu - Math.max(zd, ends.outletM);
      const reverse = zd - Math.max(zu, ends.inletM);
      if (forward > 0 && zu > ends.inletM) {
        dh = forward;
        ramp = smoothstep((zu - ends.inletM) / RAMP_M);
        drop = Math.max(0, ends.outletM - zd);
      } else if (reverse > 0 && zd > ends.outletM) {
        dh = -reverse;
        ramp = smoothstep((zd - ends.outletM) / RAMP_M);
        drop = Math.max(0, ends.inletM - zu);
      } else return { q: 0, parts: [], ...(zu <= ends.inletM && zu > zd ? { note: 'inlet-dry' as const } : {}) };
    }
    const q = invertLoss(r, dh) * ramp;
    const l = r.loss(Math.abs(q));
    const sign = Math.sign(q) || 1;
    const parts: LossPart[] = l.parts.map((p) => ({ ...p, headLossM: p.headLossM * sign }));
    // When the inlet is drawing air, the head the pipe itself does not use is lost at the inlet.
    const starved = Math.abs(dh) - l.total;
    if (ramp < 1 && starved > 0) parts.push({ kind: 'entrance', label: 'Inlet close to the surface, drawing air (estimate)', headLossM: sign * starved });
    if (drop > 0) parts.push({ kind: 'outlet', label: 'Drop from outlet above the water', headLossM: sign * drop });
    const out: LinkEval = { q, parts };
    if (ramp < 1 && q !== 0) out.note = 'inlet-dry';
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
  // Below 2% open the (1/open)² scaling is meaningless; a fully closed valve is handled by the caller.
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

/**
 * Perforated retaining screens as sharp-edged orifices on their open area:
 * h = (q / (Cd · A_open · (1 − blocked)))² / 2g, Cd 0.61 by default
 * (standard sharp-edged orifice; ISO 5167-2 / Idelchik 1986 §4 for thin perforated plates).
 */
const DEFAULT_CD_SCREEN = 0.61;
function withScreens(r: Resistive, screens: NonNullable<StageLink['screens']>): Resistive {
  if (screens.length === 0) return r;
  return {
    loss(q) {
      const base = r.loss(q);
      const parts = [...base.parts];
      let total = base.total;
      screens.forEach((sc, i) => {
        const open = sc.openAreaM2 * (1 - Math.min(0.99, Math.max(0, sc.blockedFraction ?? 0)));
        const v = Math.abs(q) / ((sc.dischargeCoefficient ?? DEFAULT_CD_SCREEN) * open);
        const h = (v * v) / (2 * GRAVITY);
        total += h;
        parts.push({ kind: 'screen', label: screens.length > 1 ? `Retaining screen ${i + 1}` : 'Retaining screen', headLossM: h });
      });
      return { ...base, total, parts };
    },
  };
}

// ---------------------------------------------------------------------------
// Pumps
// ---------------------------------------------------------------------------

function pumpModel(link: PumpLink): LinkModel {
  const s = Math.max(0.05, link.speedFraction);
  const pts = [...link.curve].sort((a, b) => a.flowM3s - b.flowM3s);
  // checkDesign guarantees ≥ 2 points with increasing flow and a positive shutoff head.
  if (pts.length < 2) throw new Error('A pump needs at least two curve points');
  const curve = monotoneCubic(pts.map((p) => p.flowM3s), pts.map((p) => p.headM));
  const last = pts.at(-1) as { flowM3s: number; headM: number };
  // Beyond the last point the curve must fall to zero head. Use the end slope if
  // it already falls steeply enough, otherwise one that reaches zero within a
  // further 20% of the last flow (a flat or rising tail would never end).
  const tailSlope = Math.min(curve.slope(last.flowM3s), -Math.max(last.headM, 1e-3) / (0.2 * last.flowM3s));
  const base = (q: number) => (q <= last.flowM3s ? curve.at(q) : last.headM + tailSlope * (q - last.flowM3s));
  // Affinity laws: H(q, s) = s² H₀(q/s).
  const head = (q: number) => s * s * base(q / s);
  const shutoff = head(0);
  // Where the curve first reaches zero head.
  let qMax: number;
  if (last.headM > 0) qMax = s * (last.flowM3s - last.headM / tailSlope);
  else {
    const firstDry = pts.find((p) => p.headM <= 0) as { flowM3s: number };
    qMax = shutoff > 0 ? brent(head, 0, s * firstDry.flowM3s, 1e-13) : 0;
  }
  const intake = link.intakeElevationM;
  // Power curve with the affinity law P(q, s) = s³ P₀(q/s).
  const pw = link.power && link.power.length > 0 ? [...link.power].sort((a, b) => a.flowM3s - b.flowM3s) : undefined;
  const pwCurve = pw && pw.length >= 2 ? monotoneCubic(pw.map((p) => p.flowM3s), pw.map((p) => p.watts)) : undefined;
  const watts = (q: number): number | undefined => {
    if (!pw) return undefined;
    const x = Math.min(Math.max(q / s, (pw[0] as { flowM3s: number }).flowM3s), (pw.at(-1) as { flowM3s: number }).flowM3s);
    return s ** 3 * (pwCurve ? pwCurve.at(x) : (pw[0] as { watts: number }).watts);
  };
  const withPower = (e: LinkEval): LinkEval => {
    const w = watts(e.q);
    return w === undefined ? e : { ...e, electricalW: w };
  };
  return {
    confidence: 'validated',
    basis: 'Manufacturer pump curve (monotone cubic), affinity laws for speed',
    confidenceAt: (q) => (q > s * last.flowM3s * 1.001 ? 'extrapolated' : 'validated'),
    evaluate(zu, zd) {
      if (zu <= intake || qMax <= 0) return withPower({ q: 0, parts: [], note: 'pump-dry', pumpHeadM: 0 });
      // The pump starts drawing air as the level falls to its intake; fade flow out over the last few mm.
      const ramp = smoothstep((zu - intake) / RAMP_M);
      const lift = zd - zu;
      if (lift >= shutoff) return withPower({ q: 0, parts: [], note: 'pump-shutoff', pumpHeadM: shutoff });
      const q = lift <= head(qMax) ? qMax : brent((x) => head(x) - lift, 0, qMax, 1e-13);
      return withPower({ q: q * ramp, parts: [], pumpHeadM: head(q), ...(ramp < 1 ? { note: 'pump-starved' as const } : {}) });
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
      const standIn = link.valveType === 'butterfly' || link.valveType === 'slide';
      const basis = standIn
        ? `No published coefficients for a ${link.valveType} valve here yet; gate-valve 3-K coefficients stand in`
        : link.openFraction >= 1 ? 'Darby 3-K' : 'Darby 3-K; part-open scaling (1/open)² is an estimate';
      const confidence: Confidence = !standIn && link.openFraction >= 1 ? 'validated' : 'unvalidated';
      if (link.openFraction <= 0) return { evaluate: () => ({ q: 0, parts: [] }), confidence: 'validated', basis: 'Closed valve' };
      const r = valveLoss(link, ctx);
      return { evaluate: resistiveModel(r), confidence, basis };
    }
    case 'stage': {
      const r = withScreens(stageLoss(link), link.screens ?? []);
      const measured = link.measured && link.measured.points.length > 0 ? link.measured : undefined;
      const screens = link.screens?.length ? ' plus retaining screens as orifices' : '';
      if (measured) {
        const qMaxMeasured = Math.max(...measured.points.map((p) => p.flowM3s));
        return {
          evaluate: resistiveModel(r),
          confidence: 'validated',
          confidenceAt: (q) => (Math.abs(q) > qMaxMeasured * 1.001 ? 'extrapolated' : 'validated'),
          basis: `Your measured head-loss curve, extended as q² beyond the last point${screens}`,
        };
      }
      return { evaluate: resistiveModel(r), confidence: 'extrapolated', basis: `Generic loss coefficient${screens}` };
    }
    case 'pump':
      return pumpModel(link);
    case 'airlift':
      throw new UnsupportedLinkError('The airlift model arrives in milestone 3.');
  }
}
