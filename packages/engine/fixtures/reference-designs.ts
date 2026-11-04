import type { ChamberNode, Design, Link, PipeLink, PumpLink } from '../src/model';
import { flow } from '../src/units';

/**
 * Mike's two reference designs (project file reference-designs/mike-reference-designs.md),
 * as M1 topology stand-ins. Until their real models land, brushes, gravel and
 * radial media are generic loss stages, and airlift returns are low-head pumps.
 * The point here is the network: two pond zones, parallel trains, branch
 * splits and isolation. Dimensions are Mike's starting assumptions.
 */

const m3h = flow.fromM3PerHour;
const chamber = (id: string, name: string, lengthM: number, widthM: number, floorM = -1.8, wallCrestM = 0.1): ChamberNode => ({
  id, kind: 'chamber', name, shape: { type: 'rect', lengthM, widthM }, floorM, wallCrestM,
});
const inletPipe = (id: string, from: string, to: string): PipeLink => ({
  id, kind: 'pipe', from, to, name: `Gravity inlet ${id}`, internalDiameterM: 0.19, lengthM: 2.5, roughnessM: 1.5e-6,
  fittings: [{ type: 'entrance-flush', count: 1 }, { type: 'exit', count: 1 }], inletElevationM: -1.2, outletElevationM: -1.2,
});
/** Stand-in for a low-lift airlift: lots of flow at a few cm of head. */
const lowHeadReturn = (id: string, from: string, to: string, intakeElevationM = -1.5): PumpLink => ({
  id, kind: 'pump', from, to, name: `Return ${id} (airlift stand-in)`, speedFraction: 1, intakeElevationM,
  curve: [[0, 0.12], [20, 0.1], [40, 0.065], [55, 0.02], [60, 0]].map(([q, h]) => ({ flowM3s: m3h(q as number), headM: h as number })),
});

// ---------------------------------------------------------------------------
// Design 1: swim pond with filter bridge
// ---------------------------------------------------------------------------

export const swimPondBridge: Design = {
  schemaVersion: 1,
  name: 'Reference 1: swim pond filter bridge (M1 stand-in)',
  water: { tempC: 15 },
  nodes: [
    { id: 'swim', kind: 'pond', name: 'Swim zone', levelM: 0, surfaceAreaM2: 120, volumeM3: 180, floorM: -2 },
    { id: 'planted', kind: 'pond', name: 'Planted zone', levelM: 0, surfaceAreaM2: 60, volumeM3: 40, floorM: -0.6 },
    chamber('forebay', 'Inlet forebay', 0.6, 1.5),
    chamber('brushes', 'Brush chamber', 3, 1.5),
    chamber('clean', 'Clean water area', 0.8, 1.5),
    { id: 'manifold', kind: 'junction', name: 'Wetland manifold', elevationM: -0.4 },
    chamber('wetland', 'Upflow gravel wetland', 3, 2, -0.5, 0.15),
  ],
  links: [
    inletPipe('in-swim-1', 'swim', 'forebay'),
    inletPipe('in-swim-2', 'swim', 'forebay'),
    inletPipe('in-planted-1', 'planted', 'forebay'),
    inletPipe('in-planted-2', 'planted', 'forebay'),
    { id: 'debris-baffle', kind: 'opening', from: 'forebay', to: 'brushes', name: 'Under-baffle opening', shape: { type: 'rect', widthM: 1.5, heightM: 0.6 }, invertM: -1.7 },
    {
      id: 'brush-bank', kind: 'stage', from: 'brushes', to: 'clean', name: 'Loose brush bank', direction: 'cross',
      stage: { type: 'generic', k: 3, referenceAreaM2: 2.5 },
    },
    { id: 'fish-barrier', kind: 'grille', from: 'clean', to: 'clean-return', name: 'Fish barrier at airlifts', faceAreaM2: 1.2, barThicknessM: 0.006, barSpacingM: 0.02, shapeFactor: 1.79, angleDeg: 90, blockedFraction: 0.1 },
    lowHeadReturn('main-1', 'clean-return', 'swim'),
    lowHeadReturn('main-2', 'clean-return', 'swim'),
    {
      id: 'wetland-lift', kind: 'pump', from: 'clean', to: 'manifold', name: 'Wetland airlift (stand-in)', speedFraction: 1, intakeElevationM: -1.5,
      curve: [[0, 0.6], [4, 0.45], [8, 0.2], [10, 0]].map(([q, h]) => ({ flowM3s: m3h(q as number), headM: h as number })),
    },
    {
      id: 'gravel', kind: 'stage', from: 'manifold', to: 'wetland', name: 'Manifold and 30 cm pea gravel', direction: 'up',
      stage: { type: 'generic', k: 2000, referenceAreaM2: 6 },
    },
    { id: 'wetland-out', kind: 'weir', from: 'wetland', to: 'planted', name: 'Wetland overflow to planted zone', crestM: 0.05, widthM: 1 },
  ] satisfies Link[],
};
swimPondBridge.nodes.push(chamber('clean-return', 'Airlift bay (behind fish barrier)', 0.5, 1.5));

// ---------------------------------------------------------------------------
// Design 2: twin radial static-media modules
// ---------------------------------------------------------------------------

const module = (s: 'a' | 'b', mediaK = 40): { nodes: Design['nodes']; links: Link[] } => ({
  nodes: [
    { id: `outer-${s}`, kind: 'chamber', name: `Module ${s.toUpperCase()} dirty annulus`, shape: { type: 'round', diameterM: 1.45 }, floorM: -0.9, wallCrestM: 0.1 },
    { id: `core-${s}`, kind: 'chamber', name: `Module ${s.toUpperCase()} clean core`, shape: { type: 'round', diameterM: 0.95 }, floorM: -0.9, wallCrestM: 0.1 },
  ],
  links: [
    { id: `feed-${s}`, kind: 'opening', from: 'prefilter', to: `outer-${s}`, name: `Feed to module ${s.toUpperCase()}`, shape: { type: 'circle', diameterM: 0.19 }, invertM: -0.6, count: 2 },
    {
      id: `media-${s}`, kind: 'stage', from: `outer-${s}`, to: `core-${s}`, name: `Module ${s.toUpperCase()} radial media`, direction: 'radial-in',
      // Reference area = collector face, 2π · 0.475 m · 0.39 m.
      stage: { type: 'generic', k: mediaK, referenceAreaM2: 1.164 },
    },
    lowHeadReturn(`ret-${s}-1`, `core-${s}`, 'pond', -0.85),
    lowHeadReturn(`ret-${s}-2`, `core-${s}`, 'pond', -0.85),
  ],
});

export function twinRadialModules(opts: { mediaKA?: number; mediaKB?: number; isolateB?: boolean } = {}): Design {
  const a = module('a', opts.mediaKA);
  const b = module('b', opts.mediaKB);
  const links: Link[] = [
    inletPipe('in-1', 'pond', 'prefilter'),
    inletPipe('in-2', 'pond', 'prefilter'),
    inletPipe('in-3', 'pond', 'prefilter'),
    inletPipe('in-4', 'pond', 'prefilter'),
    ...a.links,
    ...b.links,
  ];
  return {
    schemaVersion: 1,
    name: 'Reference 2: twin radial static-media modules (M1 stand-in)',
    water: { tempC: 15 },
    nodes: [
      { id: 'pond', kind: 'pond', name: 'Pond', levelM: 0, surfaceAreaM2: 150, volumeM3: 200, floorM: -2 },
      chamber('prefilter', 'Brush prefilter', 1.5, 1.5, -1.5),
      ...a.nodes,
      ...b.nodes,
    ],
    links: opts.isolateB ? links.map((l) => (l.id === 'feed-b' || l.id.startsWith('ret-b') ? { ...l, isolated: true } : l)) : links,
  };
}
