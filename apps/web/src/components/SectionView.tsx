import type { ChamberNode, Design, Id, Link, Node, Stage, UncertainSolveResult, UnitSystem } from '@pond/engine';
import { useMemo, type KeyboardEvent, type ReactNode } from 'react';
import { usePanZoom } from '../hooks/usePanZoom';
import { fmtText } from '../units/quantities';
import { nodeOrder } from './layout';

export type ScaleMode = 'true' | 'stretch';

interface Props {
  design: Design;
  cases: UncertainSolveResult | null;
  selection: Id | null;
  onSelect: (id: Id | null) => void;
  scale: ScaleMode;
  units: UnitSystem;
  stale?: boolean;
  /** Pane size in CSS px; the drawing reshapes to fill it with readable text. */
  size: { width: number; height: number };
}

const PAD = { top: 34, bottom: 30, left: 64, right: 24 };
const STRETCH = 8;

interface Column {
  node: Node;
  x0: number;
  x1: number;
}

/** Piecewise-linear vertical scale; in stretch mode a band around the pond surface is magnified. */
function makeY(eTop: number, eBot: number, mode: ScaleMode, band: number, H: number) {
  const plotH = H - PAD.top - PAD.bottom;
  if (mode === 'true') {
    const s = plotH / (eTop - eBot);
    return { y: (e: number) => PAD.top + (eTop - e) * s, band: 0, factor: 1 };
  }
  const bTop = Math.min(eTop, band);
  const bBot = Math.max(eBot, -band);
  const span = eTop - bTop + (bBot - eBot) + (bTop - bBot) * STRETCH;
  const s = plotH / span;
  const y = (e: number) => {
    if (e >= bTop) return PAD.top + (eTop - e) * s;
    const yBTop = PAD.top + (eTop - bTop) * s;
    if (e >= bBot) return yBTop + (bTop - e) * s * STRETCH;
    const yBBot = yBTop + (bTop - bBot) * s * STRETCH;
    return yBBot + (bBot - e) * s;
  };
  return { y, band, factor: STRETCH };
}

function nodeTop(n: Node): number {
  if (n.kind === 'chamber') return n.wallCrestM;
  if (n.kind === 'junction') return n.elevationM;
  return n.levelM;
}
function nodeBottom(n: Node): number {
  if (n.kind === 'junction') return n.elevationM;
  return n.floorM;
}

function linkHeights(l: Link): number[] {
  switch (l.kind) {
    case 'pipe':
      return [l.inletElevationM, l.outletElevationM];
    case 'opening':
      return [l.invertM];
    case 'weir':
      return [l.crestM, ...(l.standpipe ? [l.standpipe.fittedCrestM] : [])];
    case 'pump':
      return [l.intakeElevationM];
    case 'airlift':
      return [l.inletElevationM, l.outlet.type === 'vented-tee' ? l.outlet.teeElevationM : l.outlet.elevationM];
    default:
      return [];
  }
}

const selectKeys = (id: Id, onSelect: (id: Id) => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    onSelect(id);
  }
};

export function SectionView({ design, cases, selection, onSelect, scale, units, stale, size }: Props) {
  const result = cases?.likely;
  // About 1.25 user units per CSS px keeps 13-unit text near 10 px on a phone.
  const W = Math.round(Math.min(1100, Math.max(520, size.width * 1.25)));
  const H = Math.round(Math.min(W * 0.9, Math.max(300, (W * size.height) / Math.max(1, size.width))));
  const geom = useMemo(() => {
    const order = nodeOrder(design);
    // Horizontal: schematic. Pond gets a fixed width, chambers their plan length.
    const widthOf = (n: Node) => {
      if (n.kind === 'pond') return 2.2;
      if (n.kind === 'junction') return 0.5;
      return n.shape.type === 'rect' ? n.shape.lengthM : n.shape.diameterM;
    };
    const gap = 0.35;
    const totalM = order.reduce((s, n) => s + widthOf(n), 0) + gap * Math.max(0, order.length - 1);
    const sx = (W - PAD.left - PAD.right) / Math.max(1, totalM);
    let x = PAD.left;
    const cols: Column[] = order.map((n) => {
      const w = widthOf(n) * sx;
      const c = { node: n, x0: x, x1: x + w };
      x += w + gap * sx;
      return c;
    });
    const colOf = new Map(cols.map((c) => [c.node.id, c]));

    // Junction pressure heads can be metres above everything else; they are drawn clipped, not fitted.
    const freeSurface = (id: string) => design.nodes.find((n) => n.id === id)?.kind !== 'junction';
    const levelsOf = (nodes: Record<string, { levelM: number }>) => Object.entries(nodes).filter(([id]) => freeSurface(id)).map(([, r]) => r.levelM);
    const levels = [...levelsOf(result?.nodes ?? {}), ...levelsOf(cases?.low.nodes ?? {}), ...levelsOf(cases?.high.nodes ?? {})];
    const heights = [...design.nodes.flatMap((n) => [nodeTop(n), nodeBottom(n)]), ...design.links.flatMap(linkHeights), ...levels.filter(Number.isFinite), 0];
    const eTop = Math.max(...heights) + 0.12;
    const eBot = Math.min(...heights) - 0.08;
    // Stretch band: big enough to hold every level and wall top near the surface.
    const near = heights.filter((h) => Math.abs(h) <= 0.3).map(Math.abs);
    const band = Math.min(0.3, Math.max(0.06, ...near.map((h) => h + 0.02)));
    const ys = makeY(eTop, eBot, scale, band, H);
    return { cols, colOf, eTop, eBot, ...ys, returnLane: PAD.top - 14 };
  }, [design, result, cases, scale, W, H]);

  const { y, cols, colOf } = geom;
  const fit = useMemo(() => ({ x: 0, y: 0, w: W, h: H }), [W, H]);
  const pz = usePanZoom(fit);
  const pondCol = cols.find((c) => c.node.kind === 'pond');
  const sel = (id: Id) => selection === id;

  const levelOf = (id: Id) => result?.nodes[id]?.levelM;
  const bandOf = (id: Id): [number, number] | null => {
    if (!cases || cases.low === cases.likely) return null;
    const a = cases.low.nodes[id]?.levelM;
    const b = cases.high.nodes[id]?.levelM;
    if (a === undefined || b === undefined || Math.abs(a - b) < 1e-5) return null;
    return [Math.min(a, b), Math.max(a, b)];
  };

  const ticks = useMemo(() => {
    const out: number[] = [];
    const step = (geom.eTop - geom.eBot) > 1.5 ? 0.5 : 0.25;
    for (let e = Math.ceil(geom.eBot / step) * step; e <= geom.eTop; e += step) out.push(Number(e.toFixed(3)));
    if (scale === 'stretch') for (const e of [-geom.band, geom.band]) if (e > geom.eBot && e < geom.eTop) out.push(e);
    return [...new Set(out)].sort((a, b) => a - b);
  }, [geom, scale]);

  const nodeEls: ReactNode[] = cols.map((c) => {
    const n = c.node;
    const lv = levelOf(n.id);
    const band = bandOf(n.id);
    const props = {
      key: n.id,
      role: 'button',
      tabIndex: 0,
      'aria-label': `${n.name}${lv !== undefined ? `, level ${fmtText(lv, 'elevation', units, { signed: true })}` : ''}`,
      'aria-pressed': sel(n.id),
      className: `el${sel(n.id) ? ' el--sel' : ''}`,
      onClick: (e: React.MouseEvent) => {
        e.stopPropagation();
        onSelect(n.id);
      },
      onKeyDown: selectKeys(n.id, onSelect),
      'data-id': n.id,
    };
    if (n.kind === 'pond') {
      const top = y(n.levelM);
      const bot = y(n.floorM);
      return (
        <g {...props}>
          <path d={`M${c.x0} ${top} H${c.x1} V${bot} H${c.x0 + (c.x1 - c.x0) * 0.25} Z`} className="water" />
          <line x1={c.x0} x2={c.x1} y1={top} y2={top} className="waterline" />
          <path d={`M${c.x0} ${top - 6} V${top} M${c.x1} ${bot} H${c.x0 + (c.x1 - c.x0) * 0.25} L${c.x0} ${top}`} className="wall wall--soft" />
          <text x={(c.x0 + c.x1) / 2} y={(top + bot) / 2} textAnchor="middle" className="t-name">{n.name}</text>
          <rect x={c.x0} y={top - 8} width={c.x1 - c.x0} height={bot - top + 8} className="hit" />
        </g>
      );
    }
    if (n.kind === 'junction') {
      const cx = (c.x0 + c.x1) / 2;
      const cy = y(n.elevationM);
      const head = lv;
      return (
        <g {...props}>
          {head !== undefined && (
            <>
              <line x1={cx} x2={cx} y1={cy} y2={Math.max(PAD.top - 20, y(head))} className="piezo" />
              {y(head) >= PAD.top - 20 ? (
                <line x1={cx - 8} x2={cx + 8} y1={y(head)} y2={y(head)} className="waterline" />
              ) : (
                <path d={`M${cx - 5} ${PAD.top - 14} L${cx} ${PAD.top - 22} L${cx + 5} ${PAD.top - 14}`} className="piezo-arrow" />
              )}
              <text x={cx + 10} y={Math.max(PAD.top - 10, y(head) + 4)} className="t-small">
                head {fmtText(head, 'elevation', units, { signed: true })}
              </text>
            </>
          )}
          <rect x={cx - 11} y={cy - 11} width="22" height="22" rx="5" className="junction" />
          <text x={cx} y={cy + 26} textAnchor="middle" className="t-label">{n.name}</text>
          <rect x={cx - 16} y={cy - 16} width="32" height="32" className="hit" />
        </g>
      );
    }
    return <ChamberShape {...props} key={n.id} n={n} c={c} y={y} lv={lv} band={band} units={units} />;
  });

  // Links: the drawing depends on the kind and where the two ends sit.
  const linkEls: ReactNode[] = design.links.map((l) => {
    const a = colOf.get(l.from);
    const b = colOf.get(l.to);
    if (!a || !b) return null;
    const forward = a.x0 <= b.x0;
    const xa = forward ? a.x1 : a.x0;
    const xb = forward ? b.x0 : b.x1;
    const r = result?.links[l.id];
    const cls = `el link link--${l.kind}${sel(l.id) ? ' el--sel' : ''}${l.isolated ? ' link--isolated' : ''}`;
    const common = {
      key: l.id,
      role: 'button',
      tabIndex: 0,
      'aria-label': `${l.name ?? l.kind}${r ? `, flow ${fmtText(r.flowM3s, 'flow', units)}` : ''}`,
      'aria-pressed': sel(l.id),
      className: cls,
      onClick: (e: React.MouseEvent) => {
        e.stopPropagation();
        onSelect(l.id);
      },
      onKeyDown: selectKeys(l.id, onSelect),
      'data-id': l.id,
    };
    const toPond = b.node.kind === 'pond';
    const returnPath = (x: number, yStart: number) => {
      const lane = geom.returnLane;
      const px = (b.x0 + b.x1) / 2 + 20;
      const py = y((b.node as { levelM: number }).levelM) - 4;
      return `M${x} ${yStart} V${lane} H${px} V${py}`;
    };

    switch (l.kind) {
      case 'pipe': {
        const w = Math.max(3, Math.min(12, l.internalDiameterM * 70));
        const y1 = y(l.inletElevationM);
        const y2 = y(l.outletElevationM);
        let d: string;
        if (toPond && !forward) {
          const lane = geom.returnLane;
          d = `M${a.x0 + 10} ${y1} V${lane} H${b.x1 - 30} V${y2}`;
        } else {
          const xm = (xa + xb) / 2;
          d = `M${xa} ${y1} H${xm} V${y2} H${xb}`;
          if (a.node.kind === 'pond') d = `M${a.x1 - 30} ${y1} H${xm} V${y2} H${xb}`;
        }
        return (
          <g {...common}>
            <path d={d} className="pipe" style={{ strokeWidth: w }} />
            <path d={d} className="pipe-bore" style={{ strokeWidth: Math.max(1, w - 3) }} />
            <path d={d} className="hit-line" />
          </g>
        );
      }
      case 'opening': {
        const h = l.shape.type === 'circle' ? l.shape.diameterM : l.shape.heightM;
        const wx = Math.min(xa, xb);
        const ww = Math.abs(xb - xa);
        const top = y(l.invertM + h);
        const bot = y(l.invertM);
        return (
          <g {...common}>
            <rect x={wx - 4} y={top} width={ww + 8} height={Math.max(3, bot - top)} rx="2" className="opening" />
            <rect x={wx - 8} y={top - 6} width={ww + 16} height={Math.max(3, bot - top) + 12} className="hit" />
          </g>
        );
      }
      case 'weir': {
        const crest = l.standpipe?.fitted ? l.standpipe.fittedCrestM : l.crestM;
        const yc = y(crest);
        return (
          <g {...common}>
            <path d={`M${Math.min(xa, xb) - 6} ${yc} H${Math.max(xa, xb) + 6}`} className="weir" />
            <path d={`M${(xa + xb) / 2 - 5} ${yc - 8} l5 7 l5 -7`} className="weir-mark" />
            <rect x={Math.min(xa, xb) - 8} y={yc - 12} width={Math.abs(xb - xa) + 16} height={20} className="hit" />
          </g>
        );
      }
      case 'grille': {
        const top = Math.min(y(levelOf(l.from) ?? 0), y(0));
        const bot = top + 60;
        return (
          <g {...common}>
            {Array.from({ length: 5 }, (_, i) => (
              <line key={i} x1={xa + ((xb - xa) * (i + 0.5)) / 5} x2={xa + ((xb - xa) * (i + 0.5)) / 5} y1={top} y2={bot} className="grille" />
            ))}
            <rect x={Math.min(xa, xb)} y={top} width={Math.abs(xb - xa)} height={bot - top} className="hit" />
          </g>
        );
      }
      case 'valve': {
        const yv = y(Math.min(levelOf(l.from) ?? 0, 0) - 0.3);
        const xm = (xa + xb) / 2;
        return (
          <g {...common}>
            <path d={`M${xa} ${yv} H${xb}`} className="pipe" style={{ strokeWidth: 6 }} />
            <path d={`M${xm - 9} ${yv - 8} L${xm + 9} ${yv + 8} V${yv - 8} L${xm - 9} ${yv + 8} Z`} className="valve" />
            <rect x={Math.min(xa, xb)} y={yv - 12} width={Math.abs(xb - xa)} height={24} className="hit" />
          </g>
        );
      }
      case 'stage': {
        const host = a.node.kind === 'chamber' ? a : b.node.kind === 'chamber' ? b : a;
        return <StageShape {...common} key={l.id} stage={l.stage} host={host} y={y} level={levelOf(host.node.id)} />;
      }
      case 'pump': {
        const px = forward ? a.x1 - 22 : a.x0 + 22;
        const py = y(l.intakeElevationM);
        const outY = b.node.kind === 'junction' ? y(b.node.elevationM) : y(0.05);
        const d = toPond ? returnPath(px, py - 12) : `M${px} ${py - 12} V${outY} H${xb}`;
        return (
          <g {...common}>
            <path d={d} className="pipe pipe--pressure" style={{ strokeWidth: 5 }} />
            <circle cx={px} cy={py} r="12" className="pump" />
            <path d={`M${px - 5} ${py - 6} L${px + 6} ${py} L${px - 5} ${py + 6} Z`} className="pump-mark" />
            <path d={d} className="hit-line" />
          </g>
        );
      }
      case 'airlift': {
        const rx = forward ? a.x1 - 18 : a.x0 + 18;
        const outlet = l.outlet.type === 'vented-tee' ? l.outlet.teeElevationM : l.outlet.elevationM;
        const yIn = y(l.inletElevationM);
        const yOut = y(outlet);
        const yInj = y(l.injectionElevationM);
        const bubbles = Array.from({ length: 9 }, (_, k) => yInj - ((yInj - yOut) * (k + 0.5)) / 9);
        const d = toPond ? returnPath(rx, yOut) : `M${rx} ${yOut} H${xb}`;
        return (
          <g {...common}>
            <path d={`M${rx} ${yIn} V${yOut}`} className="riser" />
            <path d={d} className="return" />
            {bubbles.map((by, k) => (
              <circle key={k} cx={rx + (k % 2 ? 2 : -2)} cy={by} r={2 + k * 0.25} className="bubble" />
            ))}
            <path d={`M${rx - 14} ${yInj} H${rx - 5}`} className="airline" />
            <path d={`M${rx} ${yIn} V${yOut}`} className="hit-line" />
          </g>
        );
      }
    }
  });

  return (
    <svg
      ref={pz.svgRef}
      viewBox={pz.viewBox}
      role="img"
      aria-label={`Side elevation of ${design.name}: water levels in each chamber relative to the pond`}
      className={`section-svg${stale ? ' is-stale' : ''}`}
      onClick={() => onSelect(null)}
      {...pz.handlers}
    >
      <defs>
        <pattern id="pat-matting" width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 8 L8 0 M-2 2 L2 -2 M6 10 L10 6 M0 0 L8 8" className="tex" />
        </pattern>
        <pattern id="pat-k1" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="7" cy="7" r="4.2" className="tex" />
          <path d="M3 7 H11 M7 3 V11" className="tex tex--fine" />
        </pattern>
        <pattern id="pat-beads" width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="1.6" className="tex-dot" />
        </pattern>
        <pattern id="pat-gravel" width="10" height="9" patternUnits="userSpaceOnUse">
          <ellipse cx="3" cy="3" rx="2.6" ry="2" className="tex-dot" />
          <ellipse cx="8" cy="7" rx="2.2" ry="1.7" className="tex-dot" />
        </pattern>
        <pattern id="pat-band" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" className="band-hatch" />
        </pattern>
      </defs>
      {scale === 'stretch' && (
        <rect x={0} y={y(geom.band)} width={W} height={y(-geom.band) - y(geom.band)} className="stretch-band" />
      )}
      <g className="axis">
        {ticks.map((e) => (
          <g key={e}>
            <line x1={PAD.left - 8} x2={W - PAD.right} y1={y(e)} y2={y(e)} className={e === 0 ? 'datum' : 'grid'} />
            <text x={PAD.left - 12} y={y(e) + 4} textAnchor="end" className="t-axis">
              {fmtText(e, 'elevation', units, { signed: true })}
            </text>
          </g>
        ))}
      </g>
      {nodeEls}
      {linkEls}
      <text x={W - PAD.right} y={H - 8} textAnchor="end" className="t-axis">
        {scale === 'stretch'
          ? `Vertical ×${STRETCH} within ${fmtText(geom.band, 'head', units)} of pond level · horizontal not to scale`
          : 'True vertical scale · horizontal not to scale'}
      </text>
    </svg>
  );
}

function ChamberShape({
  n,
  c,
  y,
  lv,
  band,
  units,
  ...props
}: {
  n: ChamberNode;
  c: Column;
  y: (e: number) => number;
  lv: number | undefined;
  band: [number, number] | null;
  units: UnitSystem;
} & Record<string, unknown>) {
  const crest = y(n.wallCrestM);
  const floor = y(n.floorM);
  const shown = lv === undefined ? undefined : Math.min(lv, n.wallCrestM);
  const top = shown === undefined ? undefined : y(shown);
  const overflow = lv !== undefined && lv > n.wallCrestM;
  const cx = (c.x0 + c.x1) / 2;
  return (
    <g {...props}>
      {top !== undefined && <rect x={c.x0} y={top} width={c.x1 - c.x0} height={Math.max(0, floor - top)} className="water" />}
      {band && <rect x={c.x0 + 2} y={y(band[1])} width={c.x1 - c.x0 - 4} height={Math.max(1.5, y(band[0]) - y(band[1]))} fill="url(#pat-band)" className="band" />}
      {top !== undefined && <line x1={c.x0} x2={c.x1} y1={top} y2={top} className="waterline" />}
      <path d={`M${c.x0} ${crest} V${floor} H${c.x1} V${crest}`} className="wall" />
      {n.shape.type === 'round' && <path d={`M${c.x0 + 6} ${floor} L${cx} ${floor - 18} L${c.x1 - 6} ${floor}`} className="wall wall--soft" />}
      <text x={cx} y={floor + 18} textAnchor="middle" className="t-label">
        <title>{n.name}</title>
        {fitLabel(n.name, c.x1 - c.x0 + 20)}
      </text>
      {lv !== undefined && top !== undefined && (
        <text x={cx} y={top - 6} textAnchor="middle" className={`t-level${overflow ? ' t-danger' : ''}`}>
          {overflow ? 'Overflow' : fmtText(lv, 'elevation', units, { signed: true })}
        </text>
      )}
      <rect x={c.x0 - 4} y={crest - 22} width={c.x1 - c.x0 + 8} height={floor - crest + 44} className="hit" />
    </g>
  );
}

const STAGE_FILL: Partial<Record<Stage['type'], string>> = {
  matting: 'url(#pat-matting)',
  'static-media': 'url(#pat-k1)',
  'moving-bed': 'url(#pat-k1)',
  beads: 'url(#pat-beads)',
  'gravel-bed': 'url(#pat-gravel)',
};

function StageShape({
  stage,
  host,
  y,
  level,
  ...props
}: { stage: Stage; host: Column; y: (e: number) => number; level: number | undefined } & Record<string, unknown>) {
  const n = host.node;
  const floor = n.kind === 'junction' ? n.elevationM - 0.25 : n.floorM;
  const surface = level ?? (n.kind === 'chamber' ? n.wallCrestM - 0.1 : 0);
  const inset = 8;
  const x0 = host.x0 + inset;
  const x1 = host.x1 - inset;
  let body: ReactNode;
  if (stage.type === 'brushes') {
    const top = y(surface) + 6;
    const len = Math.max(12, y(surface - stage.lengthM) - y(surface));
    const count = Math.min(10, Math.max(2, stage.rows * 2));
    body = (
      <>
        <line x1={x0} x2={x1} y1={top - 2} y2={top - 2} className="brush-bar" />
        {Array.from({ length: count }, (_, i) => {
          const bx = x0 + ((x1 - x0) * (i + 0.5)) / count;
          return <path key={i} d={`M${bx} ${top} V${top + len}`} className="brush" />;
        })}
      </>
    );
  } else if (stage.type === 'vortex' || stage.type === 'settlement') {
    body = <path d={`M${x0} ${y(floor) - 30} q ${(x1 - x0) / 4} -14 ${(x1 - x0) / 2} 0 t ${(x1 - x0) / 2} 0`} className="swirl" />;
  } else if (stage.type === 'sieve' || stage.type === 'drum') {
    const yy = y(surface) + 8;
    body = stage.type === 'sieve'
      ? <path d={`M${x0} ${yy} L${x1} ${yy + 40}`} className="screen" />
      : <circle cx={(x0 + x1) / 2} cy={yy + 34} r={Math.min(30, (x1 - x0) / 2.4)} className="screen" />;
  } else {
    const depth = 'geometry' in stage ? (stage.geometry.type === 'planar' ? stage.geometry.depthM : stage.geometry.activeHeightM) : stage.type === 'beads' ? stage.bedDepthM : 0.3;
    const floating = stage.type === 'static-media' && stage.floating;
    const topE = floating ? surface - 0.03 : floor + 0.1 + depth;
    const botE = floating ? surface - 0.03 - depth : floor + 0.1;
    body = (
      <rect x={x0} y={y(topE)} width={x1 - x0} height={Math.max(6, y(botE) - y(topE))} rx="3" fill={STAGE_FILL[stage.type] ?? 'url(#pat-matting)'} className="media" />
    );
  }
  return (
    <g {...props}>
      {body}
      <rect x={x0} y={y(surface)} width={x1 - x0} height={Math.max(10, y(floor) - y(surface))} className="hit" />
    </g>
  );
}

/** Truncate a label to roughly fit `width` user units at the 12-unit label size. */
function fitLabel(name: string, width: number): string {
  const max = Math.max(3, Math.floor(width / 6.6));
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}
