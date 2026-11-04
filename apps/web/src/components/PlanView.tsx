import type { Design, Id, Link, Node, UnitSystem } from '@pond/engine';
import { useMemo, useRef, type KeyboardEvent } from 'react';
import { usePanZoom } from '../hooks/usePanZoom';
import { fmtText } from '../units/quantities';
import { footprint, placement } from './layout';

interface Props {
  design: Design;
  selection: Id | null;
  onSelect: (id: Id | null) => void;
  /** Called with metres while dragging. `first` is true on the first move of a drag (record history). */
  onMove: (id: Id, xM: number, yM: number, first: boolean) => void;
  units: UnitSystem;
  size: { width: number; height: number };
}

const PX_PER_M = 100;
const SNAP = 0.05;

/** Top-down plan to true scale. Drag a chamber to move it; tap to select. */
export function PlanView({ design, selection, onSelect, onMove, units, size }: Props) {
  const pos = useMemo(() => {
    const m = new Map<Id, { x: number; y: number; node: Node }>();
    design.nodes.forEach((n, i) => {
      const p = placement(design, n, i);
      m.set(n.id, { x: p.xM * PX_PER_M, y: p.yM * PX_PER_M, node: n });
    });
    return m;
  }, [design]);

  const fit = useMemo(() => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const { x, y, node } of pos.values()) {
      const f = footprint(node);
      x0 = Math.min(x0, x - f.hx * PX_PER_M);
      x1 = Math.max(x1, x + f.hx * PX_PER_M);
      y0 = Math.min(y0, y - f.hy * PX_PER_M);
      y1 = Math.max(y1, y + f.hy * PX_PER_M);
    }
    if (!Number.isFinite(x0)) return { x: -200, y: -150, w: 400, h: 300 };
    const pad = 60;
    const w = x1 - x0 + pad * 2;
    const aspect = size.height / Math.max(1, size.width);
    let ww = w;
    let h = Math.max(y1 - y0 + pad * 2, w * aspect);
    if (h > ww * aspect) ww = h / aspect;
    return { x: (x0 + x1) / 2 - ww / 2, y: (y0 + y1) / 2 - h / 2, w: ww, h };
  }, [pos, size.width, size.height]);
  const pz = usePanZoom(fit);
  // Text stays ~12 CSS px whatever the zoom.
  const upx = Math.max(pz.box.w / Math.max(1, size.width), pz.box.h / Math.max(1, size.height));
  const fs = 12 * upx;
  const drag = useRef<{ id: Id; dx: number; dy: number; first: boolean; moved: boolean } | null>(null);

  const startDrag = (id: Id) => (e: React.PointerEvent) => {
    e.stopPropagation();
    const p = pos.get(id);
    if (!p) return;
    const u = pz.toUser(e.clientX, e.clientY);
    drag.current = { id, dx: u.x - p.x, dy: u.y - p.y, first: true, moved: false };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const moveDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    e.stopPropagation();
    const u = pz.toUser(e.clientX, e.clientY);
    const p = pos.get(d.id)!;
    const nx = Math.round((u.x - d.dx) / PX_PER_M / SNAP) * SNAP;
    const ny = Math.round((u.y - d.dy) / PX_PER_M / SNAP) * SNAP;
    if (Math.abs(nx * PX_PER_M - p.x) < 0.5 && Math.abs(ny * PX_PER_M - p.y) < 0.5) return;
    onMove(d.id, Number(nx.toFixed(3)), Number(ny.toFixed(3)), d.first);
    d.first = false;
    d.moved = true;
  };
  const endDrag = (id: Id) => (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    e.stopPropagation();
    if (d && !d.moved) onSelect(id);
  };
  const keyMove = (id: Id) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(id);
      return;
    }
    const step = e.shiftKey ? 0.5 : SNAP;
    const dirs: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const dir = dirs[e.key];
    const p = pos.get(id);
    if (!dir || !p) return;
    e.preventDefault();
    onMove(id, Number((p.x / PX_PER_M + dir[0]).toFixed(3)), Number((p.y / PX_PER_M + dir[1]).toFixed(3)), true);
  };

  const sel = (id: Id) => selection === id;

  // Parallel links between the same pair are fanned out so each can be tapped.
  const pairIndex = new Map<string, number>();
  const linkEl = (l: Link) => {
    const a = pos.get(l.from);
    const b = pos.get(l.to);
    if (!a || !b) return null;
    const key = [l.from, l.to].sort().join('|');
    const k = pairIndex.get(key) ?? 0;
    pairIndex.set(key, k + 1);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const off = (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 14;
    const bend = l.kind === 'pump' || l.kind === 'airlift' ? 40 : 0;
    const mx = (a.x + b.x) / 2 + nx * (off + bend);
    const my = (a.y + b.y) / 2 + ny * (off + bend);
    const d = `M${a.x} ${a.y} Q${mx} ${my} ${b.x} ${b.y}`;
    const width = l.kind === 'pipe' ? Math.max(4, l.internalDiameterM * PX_PER_M) : 4;
    const label = l.name ?? l.kind;
    return (
      <g
        key={l.id}
        role="button"
        tabIndex={0}
        aria-label={`${label} from ${a.node.name} to ${b.node.name}`}
        aria-pressed={sel(l.id)}
        className={`el link link--${l.kind}${sel(l.id) ? ' el--sel' : ''}${l.isolated ? ' link--isolated' : ''}`}
        data-id={l.id}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(l.id);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(l.id);
          }
        }}
      >
        <path d={d} className={l.kind === 'pipe' ? 'pipe' : l.kind === 'pump' || l.kind === 'airlift' ? 'return' : 'conn'} style={{ strokeWidth: width }} />
        <circle cx={(a.x + 2 * mx + b.x) / 4} cy={(a.y + 2 * my + b.y) / 4} r="9" className={`conn-dot conn-dot--${l.kind}`} />
        <path d={d} className="hit-line" />
      </g>
    );
  };

  return (
    <svg
      ref={pz.svgRef}
      viewBox={pz.viewBox}
      role="img"
      aria-label={`Plan view of ${design.name}, to scale. Drag chambers to move them.`}
      className="plan-svg"
      onClick={() => onSelect(null)}
      {...pz.handlers}
    >
      <defs>
        <pattern id="plan-grid" width={PX_PER_M} height={PX_PER_M} patternUnits="userSpaceOnUse">
          <path d={`M${PX_PER_M} 0 H0 V${PX_PER_M}`} className="plan-grid" />
        </pattern>
      </defs>
      <rect x={fit.x - fit.w * 2} y={fit.y - fit.h * 2} width={fit.w * 5} height={fit.h * 5} fill="url(#plan-grid)" />
      {design.links.map(linkEl)}
      {[...pos.values()].map(({ x, y, node: n }) => {
        const f = footprint(n);
        const hx = f.hx * PX_PER_M;
        const hy = f.hy * PX_PER_M;
        const stage = design.links.find((l) => l.kind === 'stage' && l.from === n.id && n.kind === 'chamber');
        return (
          <g
            key={n.id}
            role="button"
            tabIndex={0}
            aria-label={`${n.name}. Arrow keys move it.`}
            aria-pressed={sel(n.id)}
            className={`el node node--${n.kind}${sel(n.id) ? ' el--sel' : ''}`}
            data-id={n.id}
            onPointerDown={startDrag(n.id)}
            onPointerMove={moveDrag}
            onPointerUp={endDrag(n.id)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={keyMove(n.id)}
          >
            {n.kind === 'pond' ? (
              <ellipse cx={x} cy={y} rx={hx} ry={hy} className="water plan-pond" />
            ) : n.kind === 'junction' ? (
              <rect x={x - hx} y={y - hy} width={hx * 2} height={hy * 2} rx="6" className="junction" />
            ) : f.round ? (
              <circle cx={x} cy={y} r={hx} className="water plan-chamber" />
            ) : (
              <rect x={x - hx} y={y - hy} width={hx * 2} height={hy * 2} rx="4" className="water plan-chamber" />
            )}
            {stage && stage.kind === 'stage' && stage.stage.type === 'brushes' && n.kind === 'chamber' && (
              <BrushGrid x={x} y={y} hx={hx} hy={hy} rows={stage.stage.rows} count={stage.stage.count} d={stage.stage.brushDiameterM * PX_PER_M} />
            )}
            {(sel(n.id) || n.kind === 'pond' || n.name.length * fs * 0.6 < hx * 2.2) && (
              <text x={x} y={n.kind === 'junction' ? y + hy + fs * 1.3 : y + fs * 0.35} textAnchor="middle" className="t-name t-halo" style={{ fontSize: fs }}>
                {n.name}
              </text>
            )}
            {n.kind === 'chamber' && sel(n.id) && (
              <text x={x} y={y + hy + fs * 1.4} textAnchor="middle" className="t-small t-halo" style={{ fontSize: fs * 0.9 }}>
                {n.shape.type === 'rect'
                  ? `${fmtText(n.shape.lengthM, 'length', units)} × ${fmtText(n.shape.widthM, 'length', units)}`
                  : `⌀ ${fmtText(n.shape.diameterM, 'length', units)}`}
              </text>
            )}
          </g>
        );
      })}
      <g transform={`translate(${pz.box.x + 16 * upx} ${pz.box.y + pz.box.h - 18 * upx})`} className="scalebar" style={{ fontSize: fs * 0.9 }}>
        <line x1="0" x2={PX_PER_M} y1="0" y2="0" />
        <line x1="0" x2="0" y1="-5" y2="5" />
        <line x1={PX_PER_M} x2={PX_PER_M} y1="-5" y2="5" />
        <text x={PX_PER_M / 2} y={-6 * upx} textAnchor="middle" className="t-axis" style={{ fontSize: fs * 0.9 }}>{units === 'metric' ? '1 m' : '3.28 ft'}</text>
      </g>
    </svg>
  );
}

/** Brushes in plan: rows across the flow, as many per row as the count allows. */
function BrushGrid({ x, y, hx, hy, rows, count, d }: { x: number; y: number; hx: number; hy: number; rows: number; count: number; d: number }) {
  const perRow = Math.max(1, Math.ceil(count / Math.max(1, rows)));
  const circles = [];
  let placed = 0;
  for (let r = 0; r < rows && placed < count; r++) {
    for (let c = 0; c < perRow && placed < count; c++, placed++) {
      const cx = x - hx + ((r + 0.5) * 2 * hx) / rows;
      const cy = y - hy + ((c + 0.5) * 2 * hy) / perRow;
      circles.push(<circle key={`${r}-${c}`} cx={cx} cy={cy} r={Math.max(2, d / 2)} className="brush-dot" />);
    }
  }
  return <g aria-hidden="true">{circles}</g>;
}
