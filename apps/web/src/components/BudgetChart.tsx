import type { BudgetEntry, Design, Id, UnitSystem } from '@pond/engine';
import { scaleBand, scaleLinear } from '@visx/scale';
import { useState } from 'react';
import { LINK_KIND_LABEL } from '../state/factory';
import { fmtText } from '../units/quantities';

interface Props {
  budget: BudgetEntry[];
  design: Design;
  units: UnitSystem;
  onSelect: (id: Id) => void;
  maxBars?: number;
}

const BAR = 18;
const ROW = 34;
const LABEL_W = 132;
const VALUE_W = 74;

/**
 * Ranked head-loss bars along the critical path. A bar is split into its parts
 * (friction, each fitting, screens) with 2px surface gaps; hover or tap for the
 * breakdown.
 */
export function BudgetChart({ budget, design, units, onSelect, maxBars = 8 }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  if (budget.length === 0) return <p className="muted">No passive losses on the flow path.</p>;
  const total = budget.reduce((s, b) => s + b.headLossM, 0);
  const shown = budget.slice(0, maxBars);
  const rest = budget.slice(maxBars);
  const rows = rest.length ? [...shown, { linkId: '__rest', headLossM: rest.reduce((s, b) => s + b.headLossM, 0), share: rest.reduce((s, b) => s + b.share, 0), parts: [] }] : shown;
  const width = 360;
  const plotW = width - LABEL_W - VALUE_W;
  const height = rows.length * ROW;
  const max = Math.max(...rows.map((r) => r.headLossM), 1e-6);
  const x = scaleLinear<number>({ domain: [0, max], range: [0, plotW] });
  const y = scaleBand<string>({ domain: rows.map((r) => r.linkId), range: [0, height], padding: 0 });
  const nameOf = (id: Id) => {
    if (id === '__rest') return `${rest.length} more`;
    const l = design.links.find((l) => l.id === id);
    return l ? (l.name ?? LINK_KIND_LABEL[l.kind]) : id;
  };
  const h = hover !== null ? rows[hover] : undefined;

  return (
    <div className="budget">
      <div className="budget-total">
        Total along the path <strong className="num">{fmtText(total, 'head', units)}</strong>
      </div>
      <div className="chart-wrap">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Head-loss budget, largest first" className="budget-svg">
          {rows.map((r, i) => {
            const y0 = (y(r.linkId) ?? 0) + (ROW - BAR) / 2;
            const w = Math.max(2, x(r.headLossM));
            // Parts become segments; tiny ones merge into their neighbour visually.
            const parts = r.parts.length > 1 ? r.parts.filter((p) => p.headLossM > 0) : [{ headLossM: r.headLossM, label: '', kind: 'friction' as const }];
            let cx = LABEL_W;
            const clickable = r.linkId !== '__rest';
            return (
              <g
                key={r.linkId}
                className={`budget-row${hover === i ? ' is-hover' : ''}`}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover((v) => (v === i ? null : v))}
                onClick={() => {
                  setHover(i);
                  if (clickable) onSelect(r.linkId);
                }}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                aria-label={`${nameOf(r.linkId)}: ${fmtText(r.headLossM, 'head', units)}, ${Math.round(r.share * 100)}% of the total`}
                onKeyDown={(e) => {
                  if (clickable && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onSelect(r.linkId);
                  }
                }}
                onFocus={() => setHover(i)}
              >
                <rect x={0} y={y(r.linkId)} width={width} height={ROW} className="hit-row" />
                <text x={LABEL_W - 10} y={y0 + BAR / 2 + 4} textAnchor="end" className="t-label">
                  {truncate(nameOf(r.linkId), 18)}
                </text>
                <clipPath id={`bar-${i}`}>
                  <path d={roundedRight(LABEL_W, y0, w, BAR, 4)} />
                </clipPath>
                <g clipPath={`url(#bar-${i})`}>
                  {parts.map((p, j) => {
                    const pw = (p.headLossM / Math.max(1e-12, r.headLossM)) * w;
                    const seg = (
                      <rect key={j} x={cx} y={y0} width={Math.max(0, pw - (j < parts.length - 1 ? 2 : 0))} height={BAR} className={`bar bar--${j % 3}`} />
                    );
                    cx += pw;
                    return seg;
                  })}
                </g>
                <text x={LABEL_W + w + 6} y={y0 + BAR / 2 + 4} className="t-value num">
                  {fmtText(r.headLossM, 'head', units)}
                </text>
              </g>
            );
          })}
        </svg>
        {h && (
          <div className="tooltip" role="status" style={{ top: Math.min(height - 10, (y(h.linkId) ?? 0) + ROW) }}>
            <div className="tooltip-title">
              {nameOf(h.linkId)} <span className="muted">· {Math.round(h.share * 100)}% of total</span>
            </div>
            {h.parts.length > 0 ? (
              <ul>
                {h.parts.map((p, k) => (
                  <li key={k}>
                    <span>{p.label}</span>
                    <span className="num">{fmtText(p.headLossM, 'head', units)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="muted">{rest.map((r) => nameOf(r.linkId)).join(', ')}</div>
            )}
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>Head-loss budget</caption>
        <tbody>
          {budget.map((b) => (
            <tr key={b.linkId}>
              <th scope="row">{nameOf(b.linkId)}</th>
              <td>{fmtText(b.headLossM, 'head', units)}</td>
              <td>{Math.round(b.share * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Rect square at the baseline (left), rounded at the data end (right). */
function roundedRight(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  return `M${x} ${y} H${x + w - rr} Q${x + w} ${y} ${x + w} ${y + rr} V${y + h - rr} Q${x + w} ${y + h} ${x + w - rr} ${y + h} H${x} Z`;
}
