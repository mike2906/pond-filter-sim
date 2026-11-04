import type { Design, Id, Link, Node } from '@pond/engine';

export type NodeKind = Node['kind'];
export type LinkKind = Link['kind'];

export function uniqueId(design: Design, base: string): Id {
  const taken = new Set<Id>([...design.nodes.map((n) => n.id), ...design.links.map((l) => l.id)]);
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

export function makeNode(design: Design, kind: NodeKind): Node {
  if (kind === 'pond') {
    return { id: uniqueId(design, 'zone'), kind, name: 'Pond zone', levelM: 0, surfaceAreaM2: 10, volumeM3: 10, floorM: -1 };
  }
  if (kind === 'junction') return { id: uniqueId(design, 'junction'), kind, name: 'Junction', elevationM: 0 };
  return {
    id: uniqueId(design, 'chamber'),
    kind,
    name: `Chamber ${design.nodes.filter((n) => n.kind === 'chamber').length + 1}`,
    shape: { type: 'rect', lengthM: 0.6, widthM: 0.6 },
    floorM: -0.9,
    wallCrestM: 0.1,
  };
}

const PUMP_CURVE = [
  { flowM3s: 0, headM: 4.5 },
  { flowM3s: 6 / 3600, headM: 3.4 },
  { flowM3s: 12 / 3600, headM: 1.2 },
  { flowM3s: 14 / 3600, headM: 0.2 },
];

export const LINK_KIND_LABEL: Record<LinkKind, string> = {
  pipe: 'Pipe',
  opening: 'Wall opening',
  weir: 'Weir or standpipe',
  grille: 'Grille or barrier',
  stage: 'Filter stage',
  valve: 'Valve',
  pump: 'Pump',
  airlift: 'Airlift',
};

export const NODE_KIND_LABEL: Record<NodeKind, string> = {
  pond: 'Pond zone',
  chamber: 'Chamber',
  junction: 'Pressurised junction',
};

/** A sensible default link between two nodes, with elevations taken from them. */
export function makeLink(design: Design, kind: LinkKind, from: Id, to: Id): Link {
  const id = uniqueId(design, kind);
  const base = { id, from, to };
  const elevationOf = (nid: Id) => {
    const n = design.nodes.find((x) => x.id === nid);
    if (!n) return 0;
    if (n.kind === 'junction') return n.elevationM;
    if (n.kind === 'pond') return n.floorM + 0.2;
    return n.floorM + 0.3;
  };
  switch (kind) {
    case 'pipe':
      return {
        ...base, kind, name: 'Pipe', internalDiameterM: 0.1036, lengthM: 2, roughnessM: 1.5e-6,
        fittings: [{ type: 'entrance-sharp', count: 1 }, { type: 'exit', count: 1 }],
        inletElevationM: elevationOf(from), outletElevationM: elevationOf(to),
      };
    case 'opening':
      return { ...base, kind, name: 'Opening', shape: { type: 'circle', diameterM: 0.11 }, invertM: -0.4, count: 1 };
    case 'weir':
      return { ...base, kind, name: 'Weir', crestM: -0.05, widthM: 0.4 };
    case 'grille':
      return { ...base, kind, name: 'Grille', faceAreaM2: 0.3, barThicknessM: 0.006, barSpacingM: 0.025, shapeFactor: 1.79, angleDeg: 90, blockedFraction: 0 };
    case 'valve':
      return { ...base, kind, name: 'Valve', valveType: 'ball', internalDiameterM: 0.1036, openFraction: 1 };
    case 'stage':
      return {
        ...base, kind, name: 'Static K1', direction: 'up',
        stage: { type: 'static-media', media: 'k1', voidage: 0.8, equivalentDiameterM: 0.009, sphericity: 0.6, floating: true, geometry: { type: 'planar', flowAreaM2: 0.36, depthM: 0.3 } },
      };
    case 'pump':
      return { ...base, kind, name: 'Pump', curve: PUMP_CURVE, speedFraction: 1, intakeElevationM: elevationOf(from) };
    case 'airlift':
      return {
        ...base, kind, name: 'Airlift', riserInternalDiameterM: 0.1036, inletElevationM: elevationOf(from), injectionElevationM: elevationOf(from) + 0.1,
        injector: 'collar', outlet: { type: 'open-top', elevationM: 0.03 }, airSupply: { type: 'fixed', airFlowM3s: 50 / 60000 },
        airLine: { internalDiameterM: 0.012, lengthM: 6 },
      };
  }
}
