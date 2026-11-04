import type { Design } from '../src/model';

/** Pond → bottom drain → vortex → matting → static K1 → airlift → pond. */
export const simpleGravityAirlift: Design = {
  schemaVersion: 1,
  name: 'Simple gravity-fed filter with airlift return',
  water: { tempC: 15 },
  nodes: [
    { id: 'pond', kind: 'pond', name: 'Pond', levelM: 0, surfaceAreaM2: 30, volumeM3: 40, floorM: -1.8 },
    { id: 'vortex', kind: 'chamber', name: 'Vortex', shape: { type: 'round', diameterM: 0.9 }, floorM: -1.2, wallCrestM: 0.1 },
    { id: 'matting', kind: 'chamber', name: 'Matting', shape: { type: 'rect', lengthM: 0.8, widthM: 0.8 }, floorM: -1.0, wallCrestM: 0.1 },
    { id: 'k1', kind: 'chamber', name: 'Static K1', shape: { type: 'rect', lengthM: 0.8, widthM: 0.8 }, floorM: -1.0, wallCrestM: 0.1 },
    { id: 'return', kind: 'chamber', name: 'Airlift chamber', shape: { type: 'rect', lengthM: 0.6, widthM: 0.8 }, floorM: -1.0, wallCrestM: 0.1 },
  ],
  links: [
    {
      id: 'drain-line', kind: 'pipe', from: 'pond', to: 'vortex', name: 'Bottom drain line',
      internalDiameterM: 0.1036, lengthM: 6, roughnessM: 1.5e-6,
      fittings: [{ type: 'bottom-drain-dome', count: 1 }, { type: 'elbow-90-long', count: 2 }, { type: 'exit', count: 1 }],
      inletElevationM: -1.8, outletElevationM: -0.9,
    },
    { id: 'vortex-to-matting', kind: 'opening', from: 'vortex', to: 'matting', shape: { type: 'circle', diameterM: 0.1036 }, invertM: -0.35, count: 1 },
    {
      id: 'matting-stage', kind: 'stage', from: 'matting', to: 'k1', direction: 'down',
      stage: { type: 'matting', fibreDiameterM: 0.0007, porosity: 0.96, geometry: { type: 'planar', flowAreaM2: 0.64, depthM: 0.3 } },
    },
    {
      id: 'k1-stage', kind: 'stage', from: 'k1', to: 'return', direction: 'up',
      stage: { type: 'static-media', media: 'k1', voidage: 0.8, equivalentDiameterM: 0.009, sphericity: 0.6, floating: true, geometry: { type: 'planar', flowAreaM2: 0.64, depthM: 0.4 } },
    },
    {
      id: 'airlift', kind: 'airlift', from: 'return', to: 'pond',
      riserInternalDiameterM: 0.1036, inletElevationM: -0.95, injectionElevationM: -0.85, injector: 'collar',
      outlet: { type: 'open-top', elevationM: 0.03 },
      airSupply: { type: 'fixed', litresPerMinute: 60 },
      airLine: { internalDiameterM: 0.012, lengthM: 8 },
    },
  ],
  layout: {
    pond: { xM: 0, yM: 0 },
    vortex: { xM: 4, yM: 0 },
    matting: { xM: 5.1, yM: 0 },
    k1: { xM: 6.0, yM: 0 },
    return: { xM: 6.8, yM: 0 },
  },
};
