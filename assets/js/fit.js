/*
 * Reshaping the Day: fit the deformation between two daily curves.
 *
 * Finds initial momenta that carry the visit-1 curve onto the visit-2 curve
 * while keeping the deformation energy small, in the spirit of the penalized
 * objective in Zou et al. (2023):
 *
 *   minimize  sum_j (deformed_1(t_j) - curve_2(t_j))^2 / noise^2  +  gamma * <p, K p>
 *
 * Momenta are expanded in smooth Gaussian bumps (one per hour, for x and y),
 * fitted by Levenberg-Marquardt on a 10-minute grid with finite-difference
 * Jacobians, then carried to the 5-minute display grid. The papers fit with
 * fshapesTK and a kernel curve distance; this browser version is an
 * approximation for demonstration.
 *
 * Browser script (window.RTD.fit) and Node module.
 */
(function (root) {
  'use strict';
  var E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.RTD.engine;

  function basis(n, centers, width) {
    var B = [];
    for (var j = 0; j < n; j++) {
      var h = 6 + 18 * j / (n - 1), row = new Float64Array(centers.length);
      for (var b = 0; b < centers.length; b++) row[b] = Math.exp(-0.5 * Math.pow((h - centers[b]) / width, 2));
      B.push(row);
    }
    return B;
  }
  function momenta(B, a, nb, scale) {
    var n = B.length, x = new Float64Array(n), y = new Float64Array(n);
    for (var j = 0; j < n; j++) {
      var sx = 0, sy = 0;
      for (var b = 0; b < nb; b++) { sx += B[j][b] * a[b]; sy += B[j][b] * a[nb + b]; }
      x[j] = sx * scale; y[j] = sy * scale;
    }
    return { x: x, y: y };
  }
  function solve(A, rhs) {                       // Cholesky for a small SPD system
    var n = rhs.length, L = A.map(function (r) { return r.slice(); });
    for (var i = 0; i < n; i++) {
      for (var j = 0; j <= i; j++) {
        var s = L[i][j];
        for (var k = 0; k < j; k++) s -= L[i][k] * L[j][k];
        if (i === j) { if (s <= 0) return null; L[i][i] = Math.sqrt(s); } else L[i][j] = s / L[j][j];
      }
    }
    var z = new Float64Array(n), x = new Float64Array(n);
    for (i = 0; i < n; i++) { s = rhs[i]; for (k = 0; k < i; k++) s -= L[i][k] * z[k]; z[i] = s / L[i][i]; }
    for (i = n - 1; i >= 0; i--) { s = z[i]; for (k = i + 1; k < n; k++) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; }
    return x;
  }

  /**
   * base, target: curves on the 5-minute grid (217 points, scaled units).
   * opts: sigma, nsteps, gamma, noise, maxIter, onProgress(iter, cost)
   * Returns {p: momenta on the 5-minute grid, result: shoot result, rmse, iterations}
   */
  function fitDeformation(base, target, opts) {
    opts = opts || {};
    var sig = opts.sigmas || (opts.sigma ? [opts.sigma] : [0.06]), nsteps = opts.nsteps || 11;
    var gamma = opts.gamma == null ? 2000 : opts.gamma, noise = opts.noise || 0.01, maxIter = opts.maxIter || 30;
    var nf = base.length, step = 2, nc = (nf - 1) / step + 1;
    var bc = new Float64Array(nc), tc = new Float64Array(nc);
    for (var j = 0; j < nc; j++) { bc[j] = base[j * step]; tc[j] = target[j * step]; }
    var centers = [];
    for (var c = 6; c <= 24; c += 1) centers.push(c);
    var nb = centers.length, np = 2 * nb, width = 0.75;
    var Bc = basis(nc, centers, width), Bf = basis(nf, centers, width);
    var SCALE = 1e-3;                            // parameters live near unit size

    // energy at the starting curve is exactly quadratic in the parameters: a' G a
    var s = E.grid(nc), K = [];
    for (j = 0; j < nc; j++) {
      K.push(new Float64Array(nc));
      for (var k = 0; k < nc; k++) {
        var dx = s[j] - s[k], dy = bc[j] - bc[k];
        K[j][k] = sig.reduce(function (acc, sg) { return acc + Math.exp(-(dx * dx + dy * dy) / (2 * sg * sg)); }, 0);
      }
    }
    var G1 = [];
    for (var a1 = 0; a1 < nb; a1++) {
      G1.push(new Float64Array(nb));
      for (var a2 = 0; a2 < nb; a2++) {
        var g = 0;
        for (j = 0; j < nc; j++) { if (Bc[j][a1] < 1e-6) continue; for (k = 0; k < nc; k++) g += Bc[j][a1] * K[j][k] * Bc[k][a2]; }
        G1[a1][a2] = g * SCALE * SCALE;
      }
    }
    function Ga(a) {
      var out = new Float64Array(np);
      for (var i = 0; i < nb; i++) for (var m = 0; m < nb; m++) { out[i] += G1[i][m] * a[m]; out[nb + i] += G1[i][m] * a[nb + m]; }
      return out;
    }
    function residuals(a) {
      var p = momenta(Bc, a, nb, SCALE), res = E.shoot(bc, p.x, p.y, { sigmas: sig, nsteps: nsteps });
      var after = E.resample(res.qx, res.qy), r = new Float64Array(nc);
      for (var i = 0; i < nc; i++) r[i] = (after[i] - tc[i]) / noise;
      return r;
    }
    function cost(a, r) {
      var c0 = 0, ga = Ga(a);
      for (var i = 0; i < r.length; i++) c0 += r[i] * r[i];
      for (i = 0; i < np; i++) c0 += gamma * a[i] * ga[i];
      return c0;
    }

    var a = new Float64Array(np), r = residuals(a), J0 = cost(a, r), mu = 1e-2, it, h = 1e-4;
    for (it = 0; it < maxIter; it++) {
      // finite-difference Jacobian (nc x np)
      var Jm = [];
      for (var q = 0; q < np; q++) {
        var ah = Float64Array.from(a); ah[q] += h;
        var rh = residuals(ah), col = new Float64Array(nc);
        for (j = 0; j < nc; j++) col[j] = (rh[j] - r[j]) / h;
        Jm.push(col);
      }
      var JTJ = [], JTr = new Float64Array(np), ga = Ga(a);
      for (var i = 0; i < np; i++) {
        JTJ.push(new Array(np));
        for (var m = 0; m < np; m++) {
          var v = 0;
          for (j = 0; j < nc; j++) v += Jm[i][j] * Jm[m][j];
          var gm = (i < nb && m < nb) ? G1[i][m] : (i >= nb && m >= nb) ? G1[i - nb][m - nb] : 0;
          JTJ[i][m] = v + gamma * gm;
        }
        var w = 0;
        for (j = 0; j < nc; j++) w += Jm[i][j] * r[j];
        JTr[i] = -(w + gamma * ga[i]);
      }
      var improved = false;
      for (var tries = 0; tries < 8; tries++) {
        var A = JTJ.map(function (row, ii) { var rr = row.slice(); rr[ii] += mu * (1 + row[ii]); return rr; });
        var d = solve(A, JTr);
        if (!d) { mu *= 4; continue; }
        var an = new Float64Array(np);
        for (i = 0; i < np; i++) an[i] = a[i] + d[i];
        var rn = residuals(an), Jn = cost(an, rn);
        if (isFinite(Jn) && Jn < J0) {
          var rel = (J0 - Jn) / J0;
          a = an; r = rn; J0 = Jn; mu = Math.max(mu / 3, 1e-6); improved = true;
          if (opts.onProgress) opts.onProgress(it + 1, J0);
          if (rel < 1e-4) it = maxIter;
          break;
        }
        mu *= 4;
      }
      if (!improved) break;
    }

    // carry to the 5-minute grid: twice the points, half the momentum per point
    var pf = momenta(Bf, a, nb, SCALE / step);
    var result = E.shoot(base, pf.x, pf.y, { sigmas: sig, nsteps: nsteps, trajectory: !!opts.trajectory });
    var after = E.resample(result.qx, result.qy), se = 0;
    for (j = 0; j < nf; j++) se += Math.pow(after[j] - target[j], 2);
    return { p: pf, result: result, rmse: Math.sqrt(se / nf), iterations: Math.min(it, maxIter), cost: J0 };
  }

  // Least-squares projection of momenta (minus the average change) onto the four patterns
  function projectPatterns(p, patterns) {
    var keys = ['p1', 'p2', 'p3', 'p4'], n = p.x.length, A = [], b = new Float64Array(4), tot = 0;
    var rx = new Float64Array(n), ry = new Float64Array(n);
    for (var j = 0; j < n; j++) { rx[j] = p.x[j] - patterns.mean.x[j]; ry[j] = p.y[j] - patterns.mean.y[j]; tot += rx[j] * rx[j] + ry[j] * ry[j]; }
    for (var i = 0; i < 4; i++) {
      A.push(new Array(4));
      var Pi = patterns[keys[i]];
      for (var m = 0; m < 4; m++) {
        var Pm = patterns[keys[m]], v = 0;
        for (j = 0; j < n; j++) v += Pi.x[j] * Pm.x[j] + Pi.y[j] * Pm.y[j];
        A[i][m] = v;
      }
      var w = 0;
      for (j = 0; j < n; j++) w += Pi.x[j] * rx[j] + Pi.y[j] * ry[j];
      b[i] = w;
    }
    var z = solve(A, b) || new Float64Array(4), resid = 0;
    for (j = 0; j < n; j++) {
      var ex = rx[j], ey = ry[j];
      for (i = 0; i < 4; i++) { ex -= z[i] * patterns[keys[i]].x[j]; ey -= z[i] * patterns[keys[i]].y[j]; }
      resid += ex * ex + ey * ey;
    }
    return { scores: Array.from(z), explained: tot > 0 ? Math.max(0, 1 - resid / tot) : 0 };
  }

  var api = { fitDeformation: fitDeformation, projectPatterns: projectPatterns };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.RTD = root.RTD || {}; root.RTD.fit = api; }
})(typeof self !== 'undefined' ? self : this);
