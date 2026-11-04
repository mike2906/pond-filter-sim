/**
 * Monotone piecewise-cubic interpolation (Fritsch and Carlson 1980,
 * "Monotone piecewise cubic interpolation", SIAM J. Numer. Anal. 17(2)).
 * Never overshoots between points, so a pump curve entered as a few points
 * stays smooth and keeps its shape.
 */
export interface MonotoneCubic {
  at(x: number): number;
  slope(x: number): number;
  xMin: number;
  xMax: number;
}

export function monotoneCubic(xs: readonly number[], ys: readonly number[]): MonotoneCubic {
  const n = xs.length;
  if (n < 2 || ys.length !== n) throw new RangeError('A curve needs at least two points');
  for (let i = 1; i < n; i++) {
    if (!((xs[i] ?? 0) > (xs[i - 1] ?? 0))) throw new RangeError('Curve x values must increase');
  }
  const x = (i: number) => xs[i] as number;
  const y = (i: number) => ys[i] as number;
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((y(i + 1) - y(i)) / (x(i + 1) - x(i)));
  const m: number[] = new Array<number>(n).fill(0);
  m[0] = d[0] as number;
  m[n - 1] = d[n - 2] as number;
  for (let i = 1; i < n - 1; i++) {
    const a = d[i - 1] as number;
    const b = d[i] as number;
    m[i] = a * b <= 0 ? 0 : (a + b) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    const di = d[i] as number;
    if (di === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = (m[i] as number) / di;
    const b = (m[i + 1] as number) / di;
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * di;
      m[i + 1] = t * b * di;
    }
  }
  const seg = (xv: number) => {
    let i = 0;
    while (i < n - 2 && xv > x(i + 1)) i++;
    return i;
  };
  const at = (xv: number) => {
    // Linear extrapolation outside the data using the end slopes.
    if (xv <= x(0)) return y(0) + (m[0] as number) * (xv - x(0));
    if (xv >= x(n - 1)) return y(n - 1) + (m[n - 1] as number) * (xv - x(n - 1));
    const i = seg(xv);
    const h = x(i + 1) - x(i);
    const t = (xv - x(i)) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * y(i) +
      (t3 - 2 * t2 + t) * h * (m[i] as number) +
      (-2 * t3 + 3 * t2) * y(i + 1) +
      (t3 - t2) * h * (m[i + 1] as number)
    );
  };
  const slope = (xv: number) => {
    if (xv <= x(0)) return m[0] as number;
    if (xv >= x(n - 1)) return m[n - 1] as number;
    const i = seg(xv);
    const h = x(i + 1) - x(i);
    const t = (xv - x(i)) / h;
    const t2 = t * t;
    return (
      ((6 * t2 - 6 * t) * y(i)) / h +
      (3 * t2 - 4 * t + 1) * (m[i] as number) +
      ((-6 * t2 + 6 * t) * y(i + 1)) / h +
      (3 * t2 - 2 * t) * (m[i + 1] as number)
    );
  };
  return { at, slope, xMin: x(0), xMax: x(n - 1) };
}

/**
 * Root of a continuous function on [a, b] with f(a), f(b) of opposite sign,
 * by Brent's method (Brent 1973, Algorithms for Minimization without Derivatives).
 */
export function brent(f: (x: number) => number, a: number, b: number, tol = 1e-12, maxIter = 200): number {
  let fa = f(a);
  let fb = f(b);
  if (fa === 0) return a;
  if (fb === 0) return b;
  if (fa * fb > 0) throw new RangeError('brent: root not bracketed');
  let c = a;
  let fc = fa;
  let d = b - a;
  let e = d;
  for (let i = 0; i < maxIter; i++) {
    if (fb * fc > 0) {
      c = a;
      fc = fa;
      d = b - a;
      e = d;
    }
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b;
      b = c;
      c = a;
      fa = fb;
      fb = fc;
      fc = fa;
    }
    const tol1 = 2 * Number.EPSILON * Math.abs(b) + 0.5 * tol;
    const xm = 0.5 * (c - b);
    if (Math.abs(xm) <= tol1 || fb === 0) return b;
    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      const s = fb / fa;
      let p: number;
      let q: number;
      if (a === c) {
        p = 2 * xm * s;
        q = 1 - s;
      } else {
        const qq = fa / fc;
        const r = fb / fc;
        p = s * (2 * xm * qq * (qq - r) - (b - a) * (r - 1));
        q = (qq - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q;
      p = Math.abs(p);
      if (2 * p < Math.min(3 * xm * q - Math.abs(tol1 * q), Math.abs(e * q))) {
        e = d;
        d = p / q;
      } else {
        d = xm;
        e = d;
      }
    } else {
      d = xm;
      e = d;
    }
    a = b;
    fa = fb;
    b += Math.abs(d) > tol1 ? d : xm > 0 ? tol1 : -tol1;
    fb = f(b);
  }
  return b;
}
