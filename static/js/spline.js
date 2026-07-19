// Client-side interpolating B-spline, mirroring spline_utils.fit_and_eval in app.py.
// Used only for the live on-canvas preview so it never waits on a network round trip;
// the server (scipy) remains the sole source of truth for the saved boundaries.npy.

function fitAndEvalClient(points, degree, width) {
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  const dedup = [];
  for (const [x, y] of pts) {
    if (dedup.length && Math.abs(x - dedup[dedup.length - 1][0]) < 1e-9) continue;
    dedup.push([x, y]);
  }
  const n = dedup.length;
  if (n < degree + 1) return null;

  const xs = dedup.map((p) => p[0]);
  const ys = dedup.map((p) => p[1]);
  const knots = buildAveragedKnots(xs, degree);
  const coeffs = solveCoefficients(xs, ys, knots, degree);

  const xMin = xs[0];
  const xMax = xs[n - 1];
  const result = new Array(width);
  for (let col = 0; col < width; col++) {
    const x = Math.min(Math.max(col, xMin), xMax);
    result[col] = evalBSpline(x, knots, coeffs, degree);
  }
  return result;
}

// Boundary knots repeated degree+1 times, interior knots from the standard
// sliding-window average of degree consecutive x's (de Boor's averaging technique) —
// gives a square, uniquely-solvable interpolation system for any degree.
function buildAveragedKnots(xs, k) {
  const n = xs.length;
  const knots = [];
  for (let i = 0; i < k + 1; i++) knots.push(xs[0]);
  for (let j = 1; j <= n - k - 1; j++) {
    let sum = 0;
    for (let i = j; i < j + k; i++) sum += xs[i];
    knots.push(sum / k);
  }
  for (let i = 0; i < k + 1; i++) knots.push(xs[n - 1]);
  return knots;
}

// Standard NURBS-book algorithms (Piegl & Tiller) for span location and basis evaluation.
function findSpan(x, knots, k, n) {
  if (x >= knots[n]) return n - 1;
  let low = k;
  let high = n;
  let mid = Math.floor((low + high) / 2);
  while (x < knots[mid] || x >= knots[mid + 1]) {
    if (x < knots[mid]) high = mid;
    else low = mid;
    mid = Math.floor((low + high) / 2);
  }
  return mid;
}

function basisFuns(span, x, k, knots) {
  const N = new Array(k + 1).fill(0);
  const left = new Array(k + 1).fill(0);
  const right = new Array(k + 1).fill(0);
  N[0] = 1;
  for (let j = 1; j <= k; j++) {
    left[j] = x - knots[span + 1 - j];
    right[j] = knots[span + j] - x;
    let saved = 0;
    for (let r = 0; r < j; r++) {
      const temp = N[r] / (right[r + 1] + left[j - r]);
      N[r] = saved + right[r + 1] * temp;
      saved = left[j - r] * temp;
    }
    N[j] = saved;
  }
  return N;
}

function solveCoefficients(xs, ys, knots, k) {
  const n = xs.length;
  const A = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    const span = findSpan(xs[i], knots, k, n);
    const N = basisFuns(span, xs[i], k, knots);
    for (let r = 0; r <= k; r++) A[i][span - k + r] = N[r];
  }
  return solveLinearSystem(A, ys.slice());
}

function solveLinearSystem(A, b) {
  const n = b.length;
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(A[row][col]) > Math.abs(A[piv][col])) piv = row;
    }
    [A[col], A[piv]] = [A[piv], A[col]];
    [b[col], b[piv]] = [b[piv], b[col]];
    const diag = A[col][col];
    for (let row = col + 1; row < n; row++) {
      const factor = A[row][col] / diag;
      for (let c = col; c < n; c++) A[row][c] -= factor * A[col][c];
      b[row] -= factor * b[col];
    }
  }
  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = b[row];
    for (let c = row + 1; c < n; c++) sum -= A[row][c] * x[c];
    x[row] = sum / A[row][row];
  }
  return x;
}

function evalBSpline(x, knots, coeffs, k) {
  const n = coeffs.length;
  const span = findSpan(x, knots, k, n);
  const N = basisFuns(span, x, k, knots);
  let y = 0;
  for (let r = 0; r <= k; r++) y += N[r] * coeffs[span - k + r];
  return y;
}
