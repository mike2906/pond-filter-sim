import type { Confidence, Design, Id, SolveResult, UncertainSolveResult, UnitSystem } from '@pond/engine';
import { useMemo } from 'react';
import { lastChamber, pondLevel, totalFlow } from '../solver/metrics';
import { hasBand } from '../solver/run';
import { useDesign } from '../state/context';
import { LINK_KIND_LABEL } from '../state/factory';
import { fmt, fmtText, type Quantity } from '../units/quantities';
import { BudgetChart } from './BudgetChart';

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  validated: 'Validated',
  extrapolated: 'Extrapolated',
  unvalidated: 'Unvalidated',
};

export function ConfidenceChip({ c }: { c: Confidence | undefined }) {
  if (!c) return null;
  return <span className={`chip chip--${c}`}>{CONFIDENCE_LABEL[c]}</span>;
}

export interface KeyStat {
  key: string;
  value: string;
  unit: string;
  /** "8.1–10.4" when the low and high cases differ. */
  band?: string;
  tone?: 'ok' | 'warn' | 'danger';
}

function banded(likely: number, low: number, high: number, q: Quantity, units: UnitSystem, signed = false): Pick<KeyStat, 'value' | 'unit' | 'band'> {
  const f = fmt(likely, q, units, { signed });
  const a = fmt(Math.min(low, high), q, units, { signed }).value;
  const b = fmt(Math.max(low, high), q, units, { signed }).value;
  return { value: f.value, unit: f.unit, ...(a !== b ? { band: `${a} to ${b}` } : {}) };
}

/** Headline numbers: flow, turnover, last-chamber drawdown, warnings. */
export function useKeyStats(units: UnitSystem): KeyStat[] {
  const design = useDesign((s) => s.design);
  const solved = useDesign((s) => s.solved);
  return useMemo(() => keyStats(design, solved?.cases ?? null, units), [design, solved, units]);
}

export function keyStats(design: Design, cases: UncertainSolveResult | null, units: UnitSystem): KeyStat[] {
  if (!cases) return [{ key: 'Flow', value: '…', unit: '' }];
  const r = cases.likely;
  if (r.status !== 'ok') {
    return [
      { key: 'Flow', value: '–', unit: '', tone: 'danger' },
      { key: 'Warnings', value: String(r.warnings.length), unit: '', tone: 'danger' },
    ];
  }
  const q = (x: SolveResult) => totalFlow(design, x);
  const pond = design.nodes.find((n) => n.kind === 'pond');
  const vol = design.nodes.reduce((s, n) => s + (n.kind === 'pond' ? n.volumeM3 : 0), 0);
  const turnover = (x: SolveResult) => (q(x) > 0 ? vol / q(x) / 3600 : Number.NaN);
  const last = lastChamber(design, r);
  const dd = (x: SolveResult) => (last ? pondLevel(design) - (x.nodes[last]?.levelM ?? Number.NaN) : Number.NaN);
  const crit = r.warnings.filter((w) => w.severity === 'critical').length;
  const warn = r.warnings.filter((w) => w.severity === 'warning').length;
  const stats: KeyStat[] = [
    { key: 'Flow', ...banded(q(r), q(cases.low), q(cases.high), 'flow', units) },
    {
      key: 'Turnover',
      value: Number.isFinite(turnover(r)) ? turnover(r).toFixed(1) : '–',
      unit: 'h',
      ...(hasBand(cases) && Number.isFinite(turnover(cases.low)) && Math.abs(turnover(cases.low) - turnover(cases.high)) > 0.05
        ? { band: `${Math.min(turnover(cases.low), turnover(cases.high)).toFixed(1)} to ${Math.max(turnover(cases.low), turnover(cases.high)).toFixed(1)}` }
        : {}),
    },
  ];
  if (last) {
    const name = design.nodes.find((n) => n.id === last)?.name ?? 'last chamber';
    stats.push({ key: `Drawdown, ${name}`, ...banded(dd(r), dd(cases.low), dd(cases.high), 'head', units) });
  }
  stats.push({ key: 'Warnings', value: String(crit + warn), unit: '', tone: crit ? 'danger' : warn ? 'warn' : 'ok' });
  void pond;
  return stats;
}

export function StatTiles({ stats, compact }: { stats: KeyStat[]; compact?: boolean }) {
  return (
    <div className={compact ? 'peek' : 'stats'} aria-label="Key results">
      {stats.map((s) => (
        <div className={`stat${s.tone ? ` stat--${s.tone}` : ''}`} key={s.key}>
          <div className="k">{s.key}</div>
          <div className="v num">
            {s.value}
            <span className="u">{s.unit}</span>
          </div>
          {s.band && !compact && <div className="band-text num">range {s.band}</div>}
        </div>
      ))}
    </div>
  );
}

/** Small results block for the selected element, shown in the inspector. */
export function ElementResult({ id, units }: { id: Id; units: UnitSystem }) {
  const solved = useDesign((s) => s.solved);
  const design = useDesign((s) => s.design);
  const r = solved?.result;
  if (!r || r.status !== 'ok') return null;
  const node = r.nodes[id];
  const link = r.links[id];
  const items: { k: string; v: string }[] = [];
  let confidence: Confidence | undefined;
  let basis: string | undefined;
  if (node) {
    items.push({ k: 'Level', v: fmtText(node.levelM, 'elevation', units, { signed: true }) });
    const drawdown = pondLevel(design) - node.levelM;
    if (design.nodes.find((n) => n.id === id)?.kind === 'chamber') {
      items.push({ k: 'Below pond', v: fmtText(drawdown, 'head', units) });
      if (node.freeboardM !== undefined) items.push({ k: node.freeboardM > 0 ? 'Overflowing by' : 'Wall above water', v: fmtText(Math.abs(node.freeboardM), 'head', units) });
    }
    confidence = node.confidence;
  }
  if (link) {
    items.push({ k: 'Flow', v: fmtText(link.flowM3s, 'flow', units) });
    if (link.headLossM < 0) items.push({ k: 'Head added', v: fmtText(-link.headLossM, 'head', units) });
    else items.push({ k: 'Head loss', v: fmtText(link.headLossM, 'head', units) });
    if (link.velocityMs !== undefined) items.push({ k: 'Velocity', v: fmtText(link.velocityMs, 'velocity', units) });
    confidence = link.confidence;
    basis = link.basis;
  }
  if (!items.length) return null;
  const parts = r.budget.find((b) => b.linkId === id)?.parts;
  return (
    <div className="el-result">
      <dl>
        {items.map((i) => (
          <div key={i.k}>
            <dt>{i.k}</dt>
            <dd className="num">{i.v}</dd>
          </div>
        ))}
      </dl>
      {parts && parts.length > 1 && (
        <ul className="parts">
          {parts.map((p, i) => (
            <li key={i}>
              <span>{p.label}</span>
              <span className="num">{fmtText(p.headLossM, 'head', units)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="el-result-foot">
        <ConfidenceChip c={confidence} />
        {basis && <span className="muted">{basis}</span>}
      </div>
    </div>
  );
}

export function ResultsPanel({ units }: { units: UnitSystem }) {
  const design = useDesign((s) => s.design);
  const solved = useDesign((s) => s.solved);
  const select = useDesign((s) => s.select);
  const stats = useKeyStats(units);
  const r = solved?.result;
  const nameOf = (id: Id | undefined) => {
    if (!id) return undefined;
    const n = design.nodes.find((x) => x.id === id);
    if (n) return n.name;
    const l = design.links.find((x) => x.id === id);
    return l ? (l.name ?? LINK_KIND_LABEL[l.kind]) : undefined;
  };
  const chambers = design.nodes.filter((n) => n.kind === 'chamber');
  const pond = pondLevel(design);
  const order = { critical: 0, warning: 1, info: 2 } as const;
  const warnings = [...(r?.warnings ?? [])].sort((a, b) => order[a.severity] - order[b.severity]);

  return (
    <div className="panel panel--results" role="region" aria-label="Results">
      <div className="panel-head">
        <h2>Results</h2>
        {solved && (
          <span className="muted small">
            {solved.source === 'preview' ? 'Preview maths' : 'Engine'} · {solved.ms.toFixed(1)} ms
          </span>
        )}
      </div>
      {solved?.source === 'preview' && (
        <p className="notice notice--preview">
          These numbers come from placeholder maths (equal flow splits, rough media resistances) so the designer can be tried now. The real network solver replaces it automatically when it lands.
        </p>
      )}
      <StatTiles stats={stats} />
      {solved && hasBand(solved.cases) && solved.cases.varied.length > 0 && (
        <p className="muted small">Ranges vary: {solved.cases.varied.join('; ')}.</p>
      )}

      {warnings.length > 0 && (
        <section aria-label="Warnings">
          <h3>Warnings</h3>
          <ul className="warnings">
            {warnings.map((w, i) => (
              <li key={i} className={`warning warning--${w.severity}`}>
                <button type="button" onClick={() => w.targetId && select(w.targetId)} disabled={!w.targetId}>
                  <span className="sev" aria-label={w.severity} />
                  <span>
                    {w.message}
                    {w.targetId && nameOf(w.targetId) && !w.message.includes(nameOf(w.targetId)!) && <span className="muted"> ({nameOf(w.targetId)})</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {r?.status === 'ok' && (
        <>
          <section aria-label="Head-loss budget">
            <h3>Head-loss budget</h3>
            <p className="muted small">Where the driving head goes along the path that loses the most. Tap a bar to select it.</p>
            <BudgetChart budget={r.budget} design={design} units={units} onSelect={select} />
          </section>

          {chambers.length > 0 && (
            <section aria-label="Levels">
              <h3>Levels</h3>
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Chamber</th>
                    <th scope="col">Below pond</th>
                    <th scope="col">Wall above water</th>
                  </tr>
                </thead>
                <tbody>
                  {chambers.map((n) => {
                    const nr = r.nodes[n.id];
                    const fb = nr?.freeboardM;
                    return (
                      <tr key={n.id} onClick={() => select(n.id)}>
                        <th scope="row">{n.name}</th>
                        <td className="num">{nr ? fmtText(pond - nr.levelM, 'head', units) : '–'}</td>
                        <td className={`num${fb !== undefined && fb > -0.02 ? ' t-danger' : ''}`}>{fb !== undefined ? (fb > 0 ? 'overflow' : fmtText(-fb, 'head', units)) : '–'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </div>
  );
}
