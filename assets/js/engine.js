/*
 * Reshaping the Day: deformation engine.
 *
 * A day is a curve of control points q_j = (scaled time, scaled activity).
 * A change between visits is a geodesic deformation driven by initial momenta
 * p_j, with a Gaussian kernel of width sigma (LDDMM geodesic shooting),
 * integrated with RK2 midpoint steps. This mirrors tools/make_synthetic.py;
 * tools/test_engine.js checks the two agree.
 *
 * Works as a browser script (window.RTD.engine) and as a Node module.
 */
(function (root) {
  'use strict';

  function grid(n) {
    var s = new Float64Array(n);
    for (var j = 0; j < n; j++) s[j] = -1 + 2 * j / (n - 1);
    return s;
  }

  // One evaluation of the Hamiltonian equations for a kernel that is a sum of Gaussians
  // K(x, y) = sum_i exp(-|x - y|^2 / (2 sigma_i^2)):
  //   dq_j = sum_k K_jk p_k,  dp_j = sum_k (p_j . p_k) sum_i K_i,jk (q_j - q_k) / sigma_i^2
  function rhs(qx, qy, px, py, sig, out) {
    var n = qx.length, dqx = out[0], dqy = out[1], dpx = out[2], dpy = out[3], m = sig.length;
    var inv2 = sig.map(function (s) { return 1 / (2 * s * s); }), inv1 = sig.map(function (s) { return 1 / (s * s); });
    dqx.fill(0); dqy.fill(0); dpx.fill(0); dpy.fill(0);
    for (var j = 0; j < n; j++) {
      dqx[j] += m * px[j]; dqy[j] += m * py[j];   // diagonal: each kernel equals 1, q_j - q_j = 0
      for (var k = j + 1; k < n; k++) {
        var dx = qx[j] - qx[k], dy = qy[j] - qy[k], r2 = dx * dx + dy * dy, K = 0, Kd = 0;
        for (var i = 0; i < m; i++) { var e = Math.exp(-r2 * inv2[i]); K += e; Kd += e * inv1[i]; }
        dqx[j] += K * px[k]; dqy[j] += K * py[k];
        dqx[k] += K * px[j]; dqy[k] += K * py[j];
        var c = Kd * (px[j] * px[k] + py[j] * py[k]);
        dpx[j] += c * dx; dpy[j] += c * dy;
        dpx[k] -= c * dx; dpy[k] -= c * dy;
      }
    }
  }

  /**
   * Shoot a curve along initial momenta.
   * base: activity values on the clock grid (length n); px, py: momenta.
   * opts.trajectory = true also returns the curve at every step (for animation).
   */
  function shoot(base, px, py, opts) {
    opts = opts || {};
    var sig = opts.sigmas || (opts.sigma ? [opts.sigma] : [0.06]), nsteps = opts.nsteps || 11;
    var n = base.length, s = grid(n);
    var qx = Float64Array.from(s), qy = Float64Array.from(base);
    var Px = Float64Array.from(px), Py = Float64Array.from(py);
    var k1 = [new Float64Array(n), new Float64Array(n), new Float64Array(n), new Float64Array(n)];
    var k2 = [new Float64Array(n), new Float64Array(n), new Float64Array(n), new Float64Array(n)];
    var mx = new Float64Array(n), my = new Float64Array(n), mpx = new Float64Array(n), mpy = new Float64Array(n);
    var h = 1 / nsteps;
    var traj = opts.trajectory ? [[Float64Array.from(qx), Float64Array.from(qy)]] : null;
    for (var step = 0; step < nsteps; step++) {
      rhs(qx, qy, Px, Py, sig, k1);
      for (var j = 0; j < n; j++) {
        mx[j] = qx[j] + 0.5 * h * k1[0][j]; my[j] = qy[j] + 0.5 * h * k1[1][j];
        mpx[j] = Px[j] + 0.5 * h * k1[2][j]; mpy[j] = Py[j] + 0.5 * h * k1[3][j];
      }
      rhs(mx, my, mpx, mpy, sig, k2);
      for (j = 0; j < n; j++) {
        qx[j] += h * k2[0][j]; qy[j] += h * k2[1][j];
        Px[j] += h * k2[2][j]; Py[j] += h * k2[3][j];
      }
      if (traj) traj.push([Float64Array.from(qx), Float64Array.from(qy)]);
    }
    return { qx: qx, qy: qy, trajectory: traj };
  }

  // Visit-2 curve back on the clock grid (linear interpolation in time)
  function resample(qx, qy) {
    var n = qx.length, s = grid(n), idx = [];
    for (var i = 0; i < n; i++) idx.push(i);
    idx.sort(function (a, b) { return qx[a] - qx[b]; });
    var xs = idx.map(function (i) { return qx[i]; }), ys = idx.map(function (i) { return qy[i]; });
    var out = new Float64Array(n), k = 0;
    for (var j = 0; j < n; j++) {
      var t = s[j];
      if (t <= xs[0]) { out[j] = ys[0]; continue; }
      if (t >= xs[n - 1]) { out[j] = ys[n - 1]; continue; }
      while (k < n - 2 && xs[k + 1] < t) k++;
      while (k > 0 && xs[k] > t) k--;
      var w = (t - xs[k]) / (xs[k + 1] - xs[k] || 1);
      out[j] = ys[k] + w * (ys[k + 1] - ys[k]);
    }
    return out;
  }

  function dailyTotal(curve, meta) {
    var tot = 0;
    for (var j = 0; j < curve.length; j++) tot += meta.grand_mean + meta.four_sd * curve[j];
    return tot * meta.step_minutes;
  }

  function pctChange(base, result, meta) {
    var after = resample(result.qx, result.qy);
    var t0 = dailyTotal(base, meta);
    return 100 * (dailyTotal(after, meta) - t0) / t0;
  }

  // Momenta for a mix of patterns; scores in "typical person" (1 SD) units
  function mix(patterns, scores, includeMean) {
    var n = patterns.p1.x.length, x = new Float64Array(n), y = new Float64Array(n);
    if (includeMean) for (var j = 0; j < n; j++) { x[j] += patterns.mean.x[j]; y[j] += patterns.mean.y[j]; }
    ['p1', 'p2', 'p3', 'p4'].forEach(function (k, i) {
      var z = scores[i] || 0;
      if (!z) return;
      for (var j = 0; j < n; j++) { x[j] += z * patterns[k].x[j]; y[j] += z * patterns[k].y[j]; }
    });
    return { x: x, y: y };
  }

  // The paper's deformation energy: sum of squared initial momenta (stored x1e6)
  function energy(px, py, meta) {
    var e = 0;
    for (var j = 0; j < px.length; j++) e += px[j] * px[j] + py[j] * py[j];
    return e * (meta.energy_scale || 1);
  }

  function percentileOf(value, sorted) {
    var lo = 0, hi = sorted.length;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (sorted[mid] < value) lo = mid + 1; else hi = mid; }
    return 100 * lo / sorted.length;
  }

  var MIN_PER_UNIT = 540; // 1080 minutes span 2 scaled units

  // Activity-weighted average sideways shift, in minutes (negative = earlier)
  function timingShift(base, result) {
    var num = 0, den = 0, s = grid(base.length);
    for (var j = 0; j < base.length; j++) {
      var w = Math.max(base[j] + 0.3, 0);
      num += w * (result.qx[j] - s[j]) * MIN_PER_UNIT; den += w;
    }
    return den ? num / den : 0;
  }

  // The push at control point j, in plain units
  function pushAt(j, base, result, meta) {
    var s = grid(base.length);
    var minutes = (result.qx[j] - s[j]) * MIN_PER_UNIT;
    var before = meta.grand_mean + meta.four_sd * base[j];
    var pct = 100 * meta.four_sd * (result.qy[j] - base[j]) / before;
    return { minutes: minutes, pct: pct, clockMinute: 360 + j * meta.step_minutes };
  }

  // Largest sideways shift and largest drop or gain, for one-line summaries
  // edge (optional): minutes to skip at 6 am and midnight, where curve ends can slide freely
  function summarize(base, result, meta, edge) {
    var s = grid(base.length), bestT = 0, bestTj = 0, bestA = 0, bestAj = 0;
    var skip = Math.round((edge || 0) / meta.step_minutes);
    for (var j = skip; j < base.length - skip; j++) {
      var dt = (result.qx[j] - s[j]) * MIN_PER_UNIT;
      if (Math.abs(dt) > Math.abs(bestT)) { bestT = dt; bestTj = j; }
      var dy = result.qy[j] - base[j];
      if (Math.abs(dy) > Math.abs(bestA)) { bestA = dy; bestAj = j; }
    }
    return {
      total: pctChange(base, result, meta),
      maxShift: bestT, maxShiftAt: 360 + bestTj * meta.step_minutes,
      maxAmountAt: 360 + bestAj * meta.step_minutes, maxAmountSign: Math.sign(bestA)
    };
  }

  function clock(minuteOfDay) {
    var m = Math.round(minuteOfDay) % 1440, h = Math.floor(m / 60), mm = m % 60;
    if (h === 0 && mm === 0) return 'midnight';
    if (h === 12 && mm === 0) return 'noon';
    var ap = h < 12 ? 'am' : 'pm', h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + (mm ? ':' + String(mm).padStart(2, '0') : '') + ' ' + ap;
  }

  var api = {
    grid: grid, shoot: shoot, resample: resample, dailyTotal: dailyTotal, pctChange: pctChange,
    mix: mix, energy: energy, percentileOf: percentileOf, timingShift: timingShift,
    pushAt: pushAt, summarize: summarize, clock: clock, MIN_PER_UNIT: MIN_PER_UNIT
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.RTD = root.RTD || {}; root.RTD.engine = api; }
})(typeof self !== 'undefined' ? self : this);
