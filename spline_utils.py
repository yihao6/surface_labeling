import numpy as np
from scipy.interpolate import make_interp_spline


def fit_and_eval(points, degree, width):
    """Fit an interpolating B-spline of the given degree through points and
    evaluate it at every integer column 0..width-1. Columns outside the
    control points' x-range are flat-extrapolated. Returns None if there
    aren't enough distinct-x points for the requested degree.
    """
    pts = sorted(points, key=lambda p: p[0])
    dedup = []
    for x, y in pts:
        if dedup and abs(x - dedup[-1][0]) < 1e-9:
            continue
        dedup.append((x, y))
    if len(dedup) < degree + 1:
        return None

    xs = np.array([p[0] for p in dedup], dtype=float)
    ys = np.array([p[1] for p in dedup], dtype=float)
    spline = make_interp_spline(xs, ys, k=degree)
    cols = np.clip(np.arange(width, dtype=float), xs[0], xs[-1])
    return spline(cols).astype(np.float32)
