import { waterProperties, WATER_T_MAX_C, WATER_T_MIN_C, temperature, type UnitSystem } from '@pond/engine';
import { useMemo } from 'react';
import { formatDensity, formatTemperature, formatViscosity } from '../format';

interface DesignProps {
  units: UnitSystem;
  tempC: number;
  onTempC: (t: number) => void;
}

const clampTemp = (t: number) => Math.min(WATER_T_MAX_C, Math.max(WATER_T_MIN_C, t));

export function EditPanel({ units, tempC, onTempC }: DesignProps) {
  const metric = units === 'metric';
  const shown = metric ? tempC : temperature.toFahrenheit(tempC);
  const step = metric ? 1 : 2;
  const setShown = (v: number) => {
    if (!Number.isFinite(v)) return;
    onTempC(clampTemp(metric ? v : temperature.fromFahrenheit(v)));
  };
  return (
    <div className="panel panel--inspector" role="region" aria-label="Edit">
      <h2>Design</h2>
      <p className="muted">The design editor arrives in milestone 2. Water temperature already feeds the engine.</p>
      <div className="field">
        <label htmlFor="water-temp">Water temperature</label>
        <div className="stepper">
          <button type="button" aria-label="Decrease temperature" onClick={() => setShown(Math.round(shown) - step)}>
            −
          </button>
          <input
            id="water-temp"
            inputMode="decimal"
            value={Number(shown.toFixed(1))}
            onChange={(e) => setShown(Number(e.target.value))}
          />
          <span className="unit">{metric ? '°C' : '°F'}</span>
          <button type="button" aria-label="Increase temperature" onClick={() => setShown(Math.round(shown) + step)}>
            +
          </button>
        </div>
      </div>
    </div>
  );
}

export function useWaterStats(tempC: number, units: UnitSystem) {
  return useMemo(() => {
    const w = waterProperties(tempC);
    return [
      { key: 'Temperature', ...formatTemperature(w.tempC, units) },
      { key: 'Density', ...formatDensity(w.density, units) },
      { key: 'Viscosity', ...formatViscosity(w.viscosity) },
    ];
  }, [tempC, units]);
}

export function ResultsPanel({ units, tempC }: { units: UnitSystem; tempC: number }) {
  const stats = useWaterStats(tempC, units);
  return (
    <div className="panel panel--results" role="region" aria-label="Results">
      <h2>Results</h2>
      <p className="muted">Water properties from the physics engine. Flow, levels and the head-loss budget arrive with the solver.</p>
      <div className="stats">
        {stats.map((s) => (
          <div className="stat" key={s.key}>
            <div className="k">{s.key}</div>
            <div className="v num">
              {s.value}
              <span className="u">{s.unit}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="notice">Viscosity nearly doubles between 25 °C and 2 °C, which is why temperature is an input everywhere.</div>
    </div>
  );
}

export function TimePanel() {
  return (
    <div className="panel panel--time" role="region" aria-label="Time">
      <h2>Time view</h2>
      <p className="muted">Clogging, cleaning and backwash over days to weeks arrive in phase 3.</p>
    </div>
  );
}
