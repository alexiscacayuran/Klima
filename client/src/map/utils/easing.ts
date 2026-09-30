/**
 * CSS cubic-bezier curves as functions of progress, for motion driven from JS.
 *
 * The same curves index.css names as `--ease-strong-out` and
 * `--ease-strong-in-out`, so a tweened shape and a CSS-transitioned bar beside
 * it move alike.
 */

/**
 * `cubic-bezier(x1, y1, x2, y2)`: the x of the curve is solved for the given
 * progress by Newton's method, falling back to bisection where the slope is
 * too flat for it, and the y at that point is the eased value.
 */
export function cubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const x = (s: number) => ((ax * s + bx) * s + cx) * s;
  const y = (s: number) => ((ay * s + by) * s + cy) * s;
  const dx = (s: number) => (3 * ax * s + 2 * bx) * s + cx;

  const solve = (t: number) => {
    let s = t;
    for (let i = 0; i < 8; i++) {
      const error = x(s) - t;
      if (Math.abs(error) < 1e-6) return s;
      const slope = dx(s);
      if (Math.abs(slope) < 1e-6) break;
      s -= error / slope;
    }
    let lo = 0;
    let hi = 1;
    s = t;
    while (hi - lo > 1e-6) {
      if (x(s) < t) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return s;
  };

  return (t) => (t <= 0 ? 0 : t >= 1 ? 1 : y(solve(t)));
}

export const easeStrongOut = cubicBezier(0.23, 1, 0.32, 1);
export const easeStrongInOut = cubicBezier(0.77, 0, 0.175, 1);
