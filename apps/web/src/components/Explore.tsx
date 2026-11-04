import type { Design, Id, UnitSystem } from '@pond/engine';
import { scaleLinear } from '@visx/scale';
import { useEffect, useMemo, useState } from 'react';
import { solver } from '../solver/client';
import type { GoalSeekResult, SweepPoint } from '../solver/explore';
import { lastChamber, type Metric } from '../solver/metrics';
import { getParam, type ParamRef } from '../solver/paths';
import { useDesign, useDesignStore } from '../state/context';
import { LINK_KIND_LABEL } from '../state/factory';
import { elementFields, type FieldDesc } from '../state/fields';
import { fmt, fmtText, toDisplay, type Quantity } from '../units/quantities';
import { useElementSize } from '../hooks/useElementSize';
import { NumberField } from './NumberField';

type MetricKind = Metric['kind'];

const METRIC_LABEL: Record<MetricKind, string> = {
  'total-flow': 'Total flow',
  drawdown: 'Drawdown below pond',
  'node-level': 'Water level',
  freeboard: 'Wall above water',
  'link-flow': 'Flow through',
  'link-loss': 'Head loss across',
  'link-velocity': 'Velocity in',
};

const METRIC_QUANTITY: Record<MetricKind, Quantity> = {
  'total-flow': 'flow',
  drawdown: 'head',
  'node-level': 'elevation',
  freeboard: 'head',
  'link-flow': 'flow',
  'link-loss': 'head',
  'link-velocity': 'velocity',
};

const NODE_METRICS: MetricKind[] = ['drawdown', 'node-level', 'freeboard'];
const LINK_METRICS: MetricKind[] = ['link-flow', 'link-loss', 'link-velocity'];

function elementName(design: Design, id: Id) {
  const n = design.nodes.find((x) => x.id === id);
  if (n) return n.name;
  const l = design.links.find((x) => x.id === id);
  return l ? (l.name ?? LINK_KIND_LABEL[l.kind]) : id;
}

/** Sweeps one input and plots a result; goal seek finds the input that hits a target. */
export function ExplorePanel({ units }: { units: UnitSystem }) {
  const design = useDesign((s) => s.design);
  const selection = useDesign((s) => s.selection);
  const solved = useDesign((s) => s.solved);
  const store = useDesignStore();

  const elements = useMemo(
    () => [...design.nodes, ...design.links].filter((e) => elementFields(e).length > 0),
    [design],
  );
  const defaultEl = selection && elements.some((e) => e.id === selection) ? selection : (elements.find((e) => 'from' in e && e.kind === 'pipe')?.id ?? elements[0]?.id ?? '');
  const [elId, setElId] = useState<Id>(defaultEl);
  const el = elements.find((e) => e.id === elId) ?? elements.find((e) => e.id === defaultEl);
  const fields = el ? elementFields(el) : [];
  const [path, setPath] = useState<string>(fields[0]?.path ?? '');
  const field: FieldDesc | undefined = fields.find((f) => f.path === path) ?? fields[0];
  const param: ParamRef | null = el && field ? { elementId: el.id, path: field.path } : null;
  const current = param ? getParam(design, param) : undefined;

  const [range, setRange] = useState<{ key: string; min: number; max: number } | null>(null);
  const rangeKey = param ? `${param.elementId}:${param.path}` : '';
  const autoRange = (() => {
    const c = current ?? 1;
    let min = c === 0 ? 0 : c * 0.5;
    let max = c === 0 ? 1 : c * 1.5;
    if (min > max) [min, max] = [max, min];
    if (field?.min !== undefined) min = Math.max(field.min, min);
    if (field?.max !== undefined) max = Math.min(field.max, max);
    return { min, max };
  })();
  const r = range && range.key === rangeKey ? range : { key: rangeKey, ...autoRange };

  const chamberDefault = lastChamber(design, solved?.result) ?? design.nodes.find((n) => n.kind === 'chamber')?.id;
  const [metricKind, setMetricKind] = useState<MetricKind>('total-flow');
  const [metricTarget, setMetricTarget] = useState<Id>('');
  const needsNode = NODE_METRICS.includes(metricKind);
  const needsLink = LINK_METRICS.includes(metricKind);
  const targetOptions = needsNode ? design.nodes.filter((n) => n.kind !== 'pond') : needsLink ? design.links : [];
  const target = targetOptions.some((t) => t.id === metricTarget) ? metricTarget : needsNode ? (chamberDefault ?? targetOptions[0]?.id ?? '') : (targetOptions[0]?.id ?? '');
  const metric: Metric = metricKind === 'total-flow' ? { kind: 'total-flow' } : ({ kind: metricKind, id: target } as Metric);
  const mq = METRIC_QUANTITY[metricKind];

  const [points, setPoints] = useState<SweepPoint[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [goal, setGoal] = useState<number | null>(null);
  const [seek, setSeek] = useState<GoalSeekResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A changed question invalidates old answers.
  const questionKey = `${rangeKey}|${r.min}|${r.max}|${JSON.stringify(metric)}`;
  useEffect(() => {
    setPoints(null);
    setSeek(null);
  }, [questionKey]);

  const run = async () => {
    if (!param) return;
    setBusy(true);
    setError(null);
    try {
      setPoints(await solver.sweep({ design, param, min: r.min, max: r.max, steps: 40, metric }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const runSeek = async () => {
    if (!param || goal === null) return;
    setBusy(true);
    setError(null);
    try {
      setSeek(await solver.goalSeek({ design, param, min: r.min, max: r.max, metric, target: goal }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const apply = (v: number) => {
    if (!param) return;
    store.getState().edit((d) => {
      const t = d.nodes.find((n) => n.id === param.elementId) ?? d.links.find((l) => l.id === param.elementId);
      if (!t) return;
      const keys = param.path.split('.');
      let cur = t as unknown as Record<string, unknown>;
      for (const k of keys.slice(0, -1)) cur = cur[k] as Record<string, unknown>;
      cur[keys[keys.length - 1]!] = field?.integer ? Math.round(v) : v;
    });
  };

  if (!el || !field || !param) {
    return (
      <div className="panel panel--explore" role="region" aria-label="Explore">
        <h2>Explore</h2>
        <p className="muted">Add some elements first.</p>
      </div>
    );
  }

  return (
    <div className="panel panel--explore" role="region" aria-label="Explore">
      <h2>Explore</h2>
      <p className="muted small">Sweep one input to see how a result responds, or ask what input hits a target.</p>
      <div className="explore-grid">
        <div className="field">
          <label htmlFor="sw-el">Change</label>
          <select id="sw-el" className="select select--full" value={el.id} onChange={(e) => { setElId(e.target.value); setPath(''); }}>
            {elements.map((e) => (
              <option key={e.id} value={e.id}>{elementName(design, e.id)}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sw-field">Input</label>
          <select id="sw-field" className="select select--full" value={field.path} onChange={(e) => setPath(e.target.value)}>
            {fields.map((f) => (
              <option key={f.path} value={f.path}>{f.label}</option>
            ))}
          </select>
        </div>
        <NumberField label="From" value={r.min} quantity={field.quantity} units={units} onChange={(v) => setRange({ key: rangeKey, min: v, max: r.max })} {...(field.min !== undefined ? { min: field.min } : {})} />
        <NumberField label="To" value={r.max} quantity={field.quantity} units={units} onChange={(v) => setRange({ key: rangeKey, min: r.min, max: v })} {...(field.max !== undefined ? { max: field.max } : {})} />
        <div className="field">
          <label htmlFor="sw-metric">Watch</label>
          <select id="sw-metric" className="select select--full" value={metricKind} onChange={(e) => setMetricKind(e.target.value as MetricKind)}>
            {(Object.keys(METRIC_LABEL) as MetricKind[]).map((k) => (
              <option key={k} value={k}>{METRIC_LABEL[k]}</option>
            ))}
          </select>
        </div>
        {(needsNode || needsLink) && (
          <div className="field">
            <label htmlFor="sw-target">{needsNode ? 'Chamber' : 'Connection'}</label>
            <select id="sw-target" className="select select--full" value={target} onChange={(e) => setMetricTarget(e.target.value)}>
              {targetOptions.map((t) => (
                <option key={t.id} value={t.id}>{elementName(design, t.id)}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="btn-row">
        <button type="button" className="btn btn--primary" onClick={run} disabled={busy}>
          {busy ? 'Working…' : 'Run sweep'}
        </button>
      </div>
      {error && <p className="notice notice--danger">{error}</p>}
      {points && (
        <SweepChart
          points={points}
          xq={field.quantity}
          yq={mq}
          units={units}
          current={current}
          goal={goal}
          xLabel={`${field.label}, ${elementName(design, el.id)}`}
          yLabel={`${METRIC_LABEL[metricKind]}${metricKind === 'total-flow' ? '' : `, ${elementName(design, target)}`}`}
        />
      )}

      <div className="sub">
        <h3>Goal seek</h3>
        <div className="explore-grid">
          <NumberField label={`Target ${METRIC_LABEL[metricKind].toLowerCase()}`} value={goal ?? 0} quantity={mq} units={units} onChange={(v) => setGoal(v)} />
          <div className="field field--end">
            <button type="button" className="btn" onClick={runSeek} disabled={busy || goal === null}>
              Find {field.label.toLowerCase()}
            </button>
          </div>
        </div>
        {seek && seek.ok && (
          <div className="notice">
            {field.label} of <strong className="num">{fmtText(seek.value, field.quantity, units)}</strong> gives {fmtText(seek.achieved, mq, units)}.{' '}
            <button type="button" className="link-btn" onClick={() => apply(seek.value)}>
              Apply to design
            </button>
          </div>
        )}
        {seek && !seek.ok && (
          <div className="notice notice--warn">
            {seek.reason}
            {seek.closest && Number.isFinite(seek.closest.achieved) && (
              <> Closest is {fmtText(seek.closest.achieved, mq, units)} at {fmtText(seek.closest.value, field.quantity, units)}. Try a wider range.</>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SweepChart({ points, xq, yq, units, current, goal, xLabel, yLabel }: {
  points: SweepPoint[];
  xq: Quantity;
  yq: Quantity;
  units: UnitSystem;
  current: number | undefined;
  goal: number | null;
  xLabel: string;
  yLabel: string;
}) {
  const [hover, setHover] = useState<SweepPoint | null>(null);
  const [ref, size] = useElementSize<HTMLElement>();
  const W = Math.max(280, Math.round(size.width || 360));
  const H = Math.round(Math.min(260, Math.max(180, W * 0.5)));
  const m = { l: 48, r: 12, t: 12, b: 34 };
  const ok = points.filter((p) => p.ok);
  if (ok.length < 2) return <p className="notice notice--warn">No solvable points in this range.</p>;
  const figure = (svg: React.ReactNode, caption: React.ReactNode) => (
    <figure className="sweep" ref={ref}>
      {svg}
      <figcaption className="small">{caption}</figcaption>
    </figure>
  );
  const xs = points.map((p) => toDisplay(p.x, xq, units));
  const ys = ok.map((p) => toDisplay(p.y, yq, units));
  const yMin = Math.min(...ys, goal !== null ? toDisplay(goal, yq, units) : Infinity);
  const yMax = Math.max(...ys, goal !== null ? toDisplay(goal, yq, units) : -Infinity);
  const pad = (yMax - yMin) * 0.08 || Math.abs(yMax) * 0.1 || 1;
  const x = scaleLinear<number>({ domain: [Math.min(...xs), Math.max(...xs)], range: [m.l, W - m.r] });
  const y = scaleLinear<number>({ domain: [yMin - pad, yMax + pad], range: [H - m.b, m.t], nice: true });
  const segs: string[] = [];
  let open = false;
  for (const p of points) {
    if (!p.ok) {
      open = false;
      continue;
    }
    const px = x(toDisplay(p.x, xq, units));
    const py = y(toDisplay(p.y, yq, units));
    segs.push(`${open ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`);
    open = true;
  }
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * W;
    let best = ok[0]!;
    for (const p of ok) if (Math.abs(x(toDisplay(p.x, xq, units)) - sx) < Math.abs(x(toDisplay(best.x, xq, units)) - sx)) best = p;
    setHover(best);
  };
  const xu = fmt(0, xq, units).unit;
  const yu = fmt(0, yq, units).unit;
  return figure(
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${yLabel} against ${xLabel}`}>
        {y.ticks(4).map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={m.l - 6} y={y(t) + 4} textAnchor="end" className="t-axis">{Number(t.toPrecision(4))}</text>
          </g>
        ))}
        {x.ticks(4).map((t) => (
          <text key={t} x={x(t)} y={H - m.b + 16} textAnchor="middle" className="t-axis">{Number(t.toPrecision(4))}</text>
        ))}
        <text x={W - m.r} y={H - 4} textAnchor="end" className="t-axis">{xu}</text>
        <text x={4} y={m.t - 2} className="t-axis">{yu}</text>
        {goal !== null && <line x1={m.l} x2={W - m.r} y1={y(toDisplay(goal, yq, units))} y2={y(toDisplay(goal, yq, units))} className="goal-line" />}
        {current !== undefined && toDisplay(current, xq, units) >= x.domain()[0]! && toDisplay(current, xq, units) <= x.domain()[1]! && (
          <line x1={x(toDisplay(current, xq, units))} x2={x(toDisplay(current, xq, units))} y1={m.t} y2={H - m.b} className="current-line" />
        )}
        <path d={segs.join(' ')} className="line" />
        {hover && (
          <>
            <line x1={x(toDisplay(hover.x, xq, units))} x2={x(toDisplay(hover.x, xq, units))} y1={m.t} y2={H - m.b} className="crosshair" />
            <circle cx={x(toDisplay(hover.x, xq, units))} cy={y(toDisplay(hover.y, yq, units))} r="4.5" className="dot" />
          </>
        )}
        <rect x={m.l} y={m.t} width={W - m.l - m.r} height={H - m.t - m.b} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} />
      </svg>,
        hover ? (
          <span className="num">
            {fmtText(hover.x, xq, units)} → <strong>{fmtText(hover.y, yq, units)}</strong>
          </span>
        ) : (
          <span className="muted">
            {yLabel} against {xLabel}. Dashed line: current value.
          </span>
        ),
  );
}
