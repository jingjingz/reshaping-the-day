/*
 * Reshaping the Day: from minute-level wear data to one smoothed daily curve.
 *
 * Mirrors the WHISH processing: keep 6 am to midnight, drop days with under
 * 14 hours of wear, need at least 4 valid days, average minute by minute,
 * smooth. Smoothing uses a Whittaker (discrete penalized spline) smoother
 * tuned to a target number of degrees of freedom (25 by default), a close
 * stand-in for the cubic smoothing spline in the papers.
 *
 * Browser script (window.RTD.pre) and Node module.
 */
(function (root) {
  'use strict';

  var WINDOW_START = 360, WINDOW_MIN = 1080;      // 6:00, 18 hours

  // ---------------------------------------------------------------- random numbers (seeded)
  function rng(seed) {
    var a = seed >>> 0;
    var next = function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.normal = function () {
      var u = 0, v = 0;
      while (u === 0) u = next();
      while (v === 0) v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    return next;
  }

  // ---------------------------------------------------------------- Whittaker smoother
  // Eigenvalues of D'D for second differences, approximated in the cosine basis
  function dfOf(lambda, n) {
    var s = 0;
    for (var k = 0; k < n; k++) {
      var m = 2 - 2 * Math.cos(Math.PI * k / n);
      s += 1 / (1 + lambda * m * m);
    }
    return s;
  }
  function lambdaFor(df, n) {
    var lo = -6, hi = 16;                          // log10 lambda
    for (var i = 0; i < 60; i++) {
      var mid = (lo + hi) / 2;
      if (dfOf(Math.pow(10, mid), n) > df) lo = mid; else hi = mid;
    }
    return Math.pow(10, (lo + hi) / 2);
  }
  // Solve (I + lambda D'D) z = y with a banded (pentadiagonal) Cholesky factorization
  function whittaker(y, df) {
    var n = y.length, lam = lambdaFor(df || 25, n);
    var d0 = new Float64Array(n), d1 = new Float64Array(n), d2 = new Float64Array(n);
    for (var i = 0; i < n - 2; i++) {               // D'D from rows [1, -2, 1]
      d0[i] += 1; d0[i + 1] += 4; d0[i + 2] += 1;
      d1[i] += -2; d1[i + 1] += -2;
      d2[i] += 1;
    }
    for (i = 0; i < n; i++) { d0[i] = 1 + lam * d0[i]; d1[i] *= lam; d2[i] *= lam; }
    var L0 = new Float64Array(n), L1 = new Float64Array(n), L2 = new Float64Array(n);
    // banded LDL': L0 = D, L1[i] = L[i][i-1], L2[i] = L[i][i-2]
    for (i = 0; i < n; i++) {
      var l2 = i >= 2 ? d2[i - 2] / L0[i - 2] : 0;
      var l1 = i >= 1 ? (d1[i - 1] - (i >= 2 ? l2 * L1[i - 1] * L0[i - 2] : 0)) / L0[i - 1] : 0;
      L2[i] = l2; L1[i] = l1;
      L0[i] = d0[i] - (i >= 1 ? l1 * l1 * L0[i - 1] : 0) - (i >= 2 ? l2 * l2 * L0[i - 2] : 0);
    }
    // forward: L u = y ; then D v = u ; back: L' z = v
    var u = new Float64Array(n);
    for (i = 0; i < n; i++) u[i] = y[i] - (i >= 1 ? L1[i] * u[i - 1] : 0) - (i >= 2 ? L2[i] * u[i - 2] : 0);
    for (i = 0; i < n; i++) u[i] /= L0[i];
    var z = new Float64Array(n);
    for (i = n - 1; i >= 0; i--) z[i] = u[i] - (i + 1 < n ? L1[i + 1] * z[i + 1] : 0) - (i + 2 < n ? L2[i + 2] * z[i + 2] : 0);
    return z;
  }

  // ---------------------------------------------------------------- wear rules
  // Non-wear: runs of at least 90 zero minutes (a simplified Choi rule)
  function wearMask(counts) {
    var n = counts.length, wear = new Uint8Array(n).fill(1), i = 0;
    while (i < n) {
      if (counts[i] === 0 || counts[i] == null) {
        var j = i;
        while (j < n && (counts[j] === 0 || counts[j] == null)) j++;
        if (j - i >= 90) for (var k = i; k < j; k++) wear[k] = 0;
        if (counts[i] == null) for (k = i; k < j; k++) wear[k] = 0;
        i = j;
      } else i++;
    }
    return wear;
  }

  /**
   * days: array of {date, counts: array of 1080 values (null = no record)}
   * Returns {curve (raw average), valid (array of day summaries), nValid}
   */
  function averageDay(days, opts) {
    opts = opts || {};
    var minWear = opts.minWearMinutes || 14 * 60;
    var sum = new Float64Array(WINDOW_MIN), cnt = new Float64Array(WINDOW_MIN), summary = [];
    days.forEach(function (d) {
      var w = wearMask(d.counts), worn = 0;
      for (var t = 0; t < WINDOW_MIN; t++) worn += w[t];
      var ok = worn >= minWear;
      summary.push({ date: d.date, wearHours: worn / 60, valid: ok });
      if (!ok) return;
      for (t = 0; t < WINDOW_MIN; t++) {
        // inside the window, minutes not worn count as zero activity, as in the papers
        var v = w[t] ? (d.counts[t] || 0) : 0;
        sum[t] += v; cnt[t] += 1;
      }
    });
    var curve = new Float64Array(WINDOW_MIN);
    for (var t = 0; t < WINDOW_MIN; t++) curve[t] = cnt[t] ? sum[t] / cnt[t] : 0;
    var nValid = summary.filter(function (s) { return s.valid; }).length;
    // day-to-day uncertainty of the smoothed average: spread of single smoothed days / sqrt(n)
    var se = null;
    if (nValid >= 2) {
      var sm = [], m2 = new Float64Array(WINDOW_MIN);
      days.forEach(function (d, i) {
        if (!summary[i].valid) return;
        var w = wearMask(d.counts), v = new Float64Array(WINDOW_MIN);
        for (var u = 0; u < WINDOW_MIN; u++) v[u] = w[u] ? (d.counts[u] || 0) : 0;
        sm.push(whittaker(v, opts.df || 25));
      });
      var mean = whittaker(curve, opts.df || 25);
      se = new Float64Array(WINDOW_MIN);
      for (t = 0; t < WINDOW_MIN; t++) {
        var ss = 0;
        for (var k = 0; k < sm.length; k++) ss += Math.pow(sm[k][t] - mean[t], 2);
        se[t] = Math.sqrt(ss / (sm.length - 1) / sm.length);
      }
    }
    return { curve: curve, days: summary, nValid: nValid, se: se };
  }

  // 1,080 minutes to the engine's 5-minute grid (217 points, 6:00 to 24:00 inclusive)
  function toGrid(minuteCurve, step) {
    step = step || 5;
    var n = WINDOW_MIN / step + 1, out = new Float64Array(n);
    for (var j = 0; j < n; j++) {
      var t = Math.min(WINDOW_MIN - 1, j * step);
      out[j] = minuteCurve[t];
    }
    return out;
  }

  // ---------------------------------------------------------------- CSV parsing
  function splitLine(line, sep) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (c === '"') { q = !q; continue; }
      if (c === sep && !q) { out.push(cur); cur = ''; } else cur += c;
    }
    out.push(cur);
    return out.map(function (s) { return s.trim(); });
  }
  function parseTime(s) {
    // 2024-03-01 06:00:00, 2024-03-01T06:00, 3/1/2024 6:00:00 (US order)
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (m) return { date: m[1] + '-' + pad(m[2]) + '-' + pad(m[3]), minute: +m[4] * 60 + +m[5], second: +(m[6] || 0) };
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
    if (m) {
      var h = +m[4];
      if (m[7]) { if (/pm/i.test(m[7]) && h < 12) h += 12; if (/am/i.test(m[7]) && h === 12) h = 0; }
      return { date: m[3] + '-' + pad(m[1]) + '-' + pad(m[2]), minute: h * 60 + +m[5], second: +(m[6] || 0) };
    }
    return null;
  }
  function pad(x) { return String(x).padStart(2, '0'); }

  /**
   * Parse a CSV of timestamped activity counts. Accepts a timestamp column and
   * either one counts column (vector magnitude) or three axis columns, which are
   * combined as sqrt(x^2 + y^2 + z^2). Epochs shorter than a minute are summed.
   * Returns {days: [{date, counts[1080]}], info} or throws an Error with a message for the user.
   */
  function parseCounts(text) {
    var lines = text.replace(/\r/g, '').split('\n').filter(function (l) { return l.trim().length; });
    if (lines.length < 2) throw new Error('The file has no data rows.');
    var sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : (lines[0].indexOf('\t') >= 0 ? '\t' : ',');
    var head = splitLine(lines[0], sep).map(function (h) { return h.toLowerCase(); });
    var tIdx = head.findIndex(function (h) { return /time|date/.test(h); });
    if (tIdx < 0) throw new Error('No timestamp column found. Name one column "timestamp".');
    var vmIdx = head.findIndex(function (h) { return /^(vm|vector ?magnitude|vectormagnitude|counts|count|activity|vm_counts)$/.test(h); });
    var axIdx = ['axis1', 'axis2', 'axis3'].map(function (a) { return head.indexOf(a); });
    if (vmIdx < 0 && axIdx.some(function (i) { return i < 0; })) {
      vmIdx = head.findIndex(function (h, i) { return i !== tIdx; });
      if (vmIdx < 0) throw new Error('No counts column found. Name it "counts" or provide axis1, axis2 and axis3.');
    }
    // Axis counts are summed to the minute first, then combined as a vector magnitude (as in the papers)
    var byDay = {}, bad = 0, seconds = {}, axes = vmIdx < 0;
    for (var r = 1; r < lines.length; r++) {
      var f = splitLine(lines[r], sep), t = parseTime(f[tIdx] || '');
      if (!t) { bad++; continue; }
      var vals = axes ? [+f[axIdx[0]], +f[axIdx[1]], +f[axIdx[2]]] : [parseFloat(f[vmIdx])];
      if (!vals.every(isFinite)) { bad++; continue; }
      seconds[t.second] = true;
      var m = t.minute - WINDOW_START;
      if (m < 0 || m >= WINDOW_MIN) continue;
      var day = byDay[t.date] || (byDay[t.date] = new Array(WINDOW_MIN).fill(null));
      if (!day[m]) day[m] = vals.map(function () { return 0; });
      for (var k = 0; k < vals.length; k++) day[m][k] += vals[k];
    }
    var dates = Object.keys(byDay).sort();
    if (!dates.length) throw new Error('No rows between 6 am and midnight could be read. Check the timestamp format, for example 2024-03-01 06:00:00.');
    function vm(cell) {
      if (!cell) return null;
      if (cell.length === 1) return cell[0];
      return Math.sqrt(cell[0] * cell[0] + cell[1] * cell[1] + cell[2] * cell[2]);
    }
    return {
      days: dates.map(function (d) { return { date: d, counts: byDay[d].map(vm) }; }),
      info: { rows: lines.length - 1, skipped: bad, subMinute: Object.keys(seconds).length > 1, sep: sep }
    };
  }

  // ---------------------------------------------------------------- synthetic minute data
  // Realistic-looking days around a smooth profile given in counts per minute (1080 values)
  function synthDays(profile, nDays, seed, opts) {
    opts = opts || {};
    var R = rng(seed), days = [];
    for (var d = 0; d < nDays; d++) {
      var counts = new Array(WINDOW_MIN), dayScale = Math.exp(0.18 * R.normal());
      var shift = Math.round(25 * R.normal());          // day-to-day timing wobble, minutes
      var state = 0;
      for (var t = 0; t < WINDOW_MIN; t++) {
        var src = Math.min(WINDOW_MIN - 1, Math.max(0, t - shift));
        var mu = Math.max(profile[src], 0) * dayScale;
        // bouts: a two-state chain, sitting or moving, one third of minutes moving;
        // levels and noise chosen so the expected count equals the profile
        if (state === 0 && R() < 0.06) state = 1; else if (state === 1 && R() < 0.12) state = 0;
        var v = state ? mu * (1.8 + 0.8 * R()) : mu * 0.8 * R();
        counts[t] = Math.max(0, Math.round(v * Math.exp(0.35 * R.normal() - 0.06125)));
      }
      // the device comes off a little before midnight on some days, as with real wear
      var off = Math.round(40 * R());
      for (t = WINDOW_MIN - off; t < WINDOW_MIN; t++) counts[t] = 0;
      days.push({ date: 'day ' + (d + 1), counts: counts });
    }
    return days;
  }

  // Expand a 5-minute grid curve (217 points) to 1080 minutes
  function fromGrid(grid, step) {
    step = step || 5;
    var out = new Float64Array(WINDOW_MIN);
    for (var t = 0; t < WINDOW_MIN; t++) {
      var f = t / step, i = Math.min(grid.length - 2, Math.floor(f)), w = f - i;
      out[t] = grid[i] + w * (grid[i + 1] - grid[i]);
    }
    return out;
  }

  // A week of minute-level counts as CSV text (timestamp,counts), midnight to midnight, for samples and tests
  function sampleCSV(profile, nDays, seed, startDate) {
    var days = synthDays(profile, nDays, seed), lines = ['timestamp,counts'];
    var d0 = new Date(startDate + 'T00:00:00Z');
    days.forEach(function (d, k) {
      var dt = new Date(d0.getTime() + k * 86400000), ds = dt.toISOString().slice(0, 10);
      for (var m = 0; m < 1440; m++) {
        var t = m - WINDOW_START, v = (t >= 0 && t < WINDOW_MIN) ? d.counts[t] : 0;
        lines.push(ds + ' ' + pad(Math.floor(m / 60)) + ':' + pad(m % 60) + ':00,' + v);
      }
    });
    return lines.join('\n');
  }

  var api = {
    WINDOW_START: WINDOW_START, WINDOW_MIN: WINDOW_MIN, rng: rng, whittaker: whittaker, dfOf: dfOf, lambdaFor: lambdaFor,
    wearMask: wearMask, averageDay: averageDay, toGrid: toGrid, fromGrid: fromGrid,
    parseCounts: parseCounts, parseTime: parseTime, synthDays: synthDays, sampleCSV: sampleCSV
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.RTD = root.RTD || {}; root.RTD.pre = api; }
})(typeof self !== 'undefined' ? self : this);
