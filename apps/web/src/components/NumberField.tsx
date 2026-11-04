import type { UnitSystem } from '@pond/engine';
import { useEffect, useId, useState } from 'react';
import { fromDisplay, roundShown, toDisplay, unitDef, type Quantity } from '../units/quantities';

interface Props {
  label: string;
  /** SI value */
  value: number;
  quantity: Quantity;
  units: UnitSystem;
  onChange: (si: number) => void;
  /** SI bounds */
  min?: number;
  max?: number;
  hint?: string;
  integer?: boolean;
}

function parseShown(text: string): number {
  return Number(text.replace(',', '.').replace('−', '-').trim());
}

/**
 * A typed field with − / + steppers. Values commit on blur, Enter or a step,
 * so typing "0.0" on the way to "0.05" doesn't create history entries.
 */
export function NumberField({ label, value, quantity, units, onChange, min, max, hint, integer }: Props) {
  const id = useId();
  const def = unitDef(quantity, units);
  const shown = roundShown(toDisplay(value, quantity, units), quantity, units);
  const [text, setText] = useState(String(shown));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(String(shown));
  }, [shown, focused]);

  const clamp = (si: number) => {
    let v = si;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return integer ? Math.round(v) : v;
  };
  const commit = (raw: string) => {
    const n = parseShown(raw);
    if (!Number.isFinite(n)) {
      setText(String(shown));
      return;
    }
    // Leaving a field without changing what it shows must not write the rounded value back.
    if (n === shown) {
      setText(String(shown));
      return;
    }
    const si = clamp(fromDisplay(n, quantity, units));
    if (si !== value) onChange(si);
    setText(String(roundShown(toDisplay(si, quantity, units), quantity, units)));
  };
  const step = (dir: 1 | -1) => {
    // Step from the shown value so steps land on round numbers.
    const base = Math.round(shown / def.step) * def.step;
    const next = base + dir * def.step;
    onChange(clamp(fromDisplay(Number(next.toFixed(6)), quantity, units)));
  };
  const invalid = focused && !Number.isFinite(parseShown(text));

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="stepper">
        <button type="button" aria-label={`Decrease ${label}`} onClick={() => step(-1)} tabIndex={-1}>
          −
        </button>
        <input
          id={id}
          inputMode="decimal"
          value={text}
          aria-invalid={invalid || undefined}
          onFocus={() => setFocused(true)}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => {
            setFocused(false);
            commit(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              step(1);
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              step(-1);
            }
          }}
        />
        {def.unit && <span className="unit">{def.unit}</span>}
        <button type="button" aria-label={`Increase ${label}`} onClick={() => step(1)} tabIndex={-1}>
          +
        </button>
      </div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
