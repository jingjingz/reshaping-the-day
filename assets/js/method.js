/* Reshaping the Day: How it works page. */
(function () {
  'use strict';
  var E = window.RTD.engine, C = window.RTD.charts, P = window.RTD.pre;
  var SVGNS = 'http://www.w3.org/2000/svg';

  // Render-at-width helper for page-specific charts
  function responsive(el, label, draw, heightFn) {
    el.classList.add('chart');
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label);
    el.appendChild(svg);
    function render() {
      var W = Math.max(el.clientWidth || 500, 260), H = heightFn(W);
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('width', W); svg.setAttribute('height', H);
      svg.innerHTML = draw(W, H);
    }
    render();
    if (window.ResizeObserver) new ResizeObserver(render).observe(el);
  }
  var TICKS = { 6: '6 am', 12: 'noon', 18: '6 pm', 24: 'midnight', 9: '9 am', 15: '3 pm', 21: '9 pm' };
  function timeAxis(W, H, pad, X) {
    var ticks = W >= 600 ? [6, 9, 12, 15, 18, 21, 24] : [6, 12, 18, 24], b = H - pad.b, out = '';
    ticks.forEach(function (t) {
      var anchor = t === 6 ? 'start' : (t === 24 ? 'end' : 'middle');
      out += '<line class="grid" x1="' + X(t) + '" y1="' + pad.t + '" x2="' + X(t) + '" y2="' + b + '"/>' +
        '<text class="tick" x="' + X(t) + '" y="' + (b + 19) + '" text-anchor="' + anchor + '">' + TICKS[t] + '</text>';
    });
    return out + '<line class="axis" x1="' + pad.l + '" y1="' + b + '" x2="' + (W - pad.r) + '" y2="' + b + '"/>';
  }
  function poly(vals, X, Y, step) {
    var d = '';
    for (var i = 0; i < vals.length; i += step || 1) d += (i ? 'L' : 'M') + X(6 + i / 60).toFixed(1) + ',' + Y(vals[i]).toFixed(1);
    return d;
  }

  fetch('data/synthetic.json').then(function (r) { return r.json(); }).then(function (D) {
    var meta = D.meta;
    function shoot(base, p, traj) { return E.shoot(base, p.x, p.y, { sigmas: meta.sigmas, nsteps: meta.nsteps, trajectory: traj }); }

    // ---------------- step 1: noisy days, their average, the smoothed curve
    var profile = P.fromGrid(D.hero.base.map(function (v) { return meta.grand_mean + meta.four_sd * v; }));
    var days = P.synthDays(profile, 4, 7, {});
    var avg = P.averageDay(days).curve, smooth = P.whittaker(avg, 25);
    // display only: 5-minute means, drawn at each bin's first minute
    function bin5(v) {
      var out = new Array(v.length);
      for (var i = 0; i < v.length; i += 5) {
        var s = 0, n = 0;
        for (var k = i; k < Math.min(v.length, i + 5); k++) { s += v[k] || 0; n++; }
        for (k = i; k < Math.min(v.length, i + 5); k++) out[k] = s / n;
      }
      return out;
    }
    var ymax = 0;
    days.forEach(function (d) { bin5(d.counts).forEach(function (v) { if (v > ymax) ymax = v; }); });
    ymax = Math.min(ymax * 1.05, 1800);
    responsive(document.getElementById('m-days'),
      'Four noisy synthetic days of minute-level counts, their average, and a smooth daily curve through them.',
      function (W, H) {
        var pad = { t: 12, r: 10, b: 30, l: 44 };
        var X = function (h) { return pad.l + (h - 6) / 18 * (W - pad.l - pad.r); };
        var Y = function (v) { return pad.t + (1 - Math.min(v, ymax) / ymax) * (H - pad.t - pad.b); };
        var out = timeAxis(W, H, pad, X);
        [0, 1000, 2000].forEach(function (v) {
          if (v > ymax) return;
          out += '<text class="tick" x="' + (pad.l - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + v.toLocaleString() + '</text>';
        });
        out += '<text class="tick" x="' + pad.l + '" y="' + (pad.t - 2) + '">counts per minute</text>';
        days.forEach(function (d) { out += '<path class="raw" d="' + poly(bin5(d.counts), X, Y, 5) + '"/>'; });
        out += '<path class="avg" d="' + poly(bin5(avg), X, Y, 5) + '"/><path class="smooth" d="' + poly(smooth, X, Y, 1) + '"/>';
        return out;
      }, function (W) { return Math.round(Math.min(Math.max(W * 0.6, 240), 380)); });

    // ---------------- step 3: the flow at four moments
    var hero = shoot(D.hero.base, D.hero.p, true), last = hero.trajectory.length - 1;
    var frames = [0, Math.round(last / 3), Math.round(2 * last / 3), last];
    var names = ['Visit 1', 'A third of the way', 'Two thirds of the way', 'Visit 2'];
    var host = document.getElementById('m-frames');
    frames.forEach(function (f, i) {
      var fig = document.createElement('figure'), holder = document.createElement('div'), cap = document.createElement('figcaption');
      cap.textContent = names[i];
      fig.appendChild(holder); fig.appendChild(cap); host.appendChild(fig);
      var tr = hero.trajectory[f];
      new C.DayChart(holder, { base: D.hero.base, result: { qx: tr[0], qy: tr[1] }, mode: f === last ? 'push' : 'none', every: 40, meta: meta,
        height: function (W) { return Math.round(Math.min(Math.max(W * 0.6, 150), 200)); }, label: names[i] + ' of the flow from visit 1 to visit 2.' });
    });

    // ---------------- why not subtract: the late riser
    // a pure timing change: the morning rise moved 60 minutes later, nothing else
    var B = D.examples.pure_shift, resB = shoot(B.base, B.p);
    var diff = B.base.map(function (v, j) { return B.target[j] - v; });
    var sB = E.summarize(B.base, resB, meta);
    document.getElementById('m-shift-min').textContent = Math.round(sB.maxShift);
    var dmax = Math.max.apply(null, diff.map(Math.abs)) * 1.15;
    var small = function (W) { return Math.round(Math.min(Math.max(W * 0.5, 190), 280)); };
    responsive(document.getElementById('m-diff'),
      'Subtracting visit 1 from visit 2 at each clock time: a large drop in early morning and a small gain around 10 am, which reads as two changes in amount.',
      function (W, H) {
        var pad = { t: 14, r: 12, b: 30, l: 12 }, n = diff.length;
        var X = function (h) { return pad.l + (h - 6) / 18 * (W - pad.l - pad.r); };
        var Y = function (v) { return pad.t + (dmax - v) / (2 * dmax) * (H - pad.t - pad.b); };
        var out = timeAxis(W, H, pad, X), bw = Math.max(1, (W - pad.l - pad.r) / (n - 1) - 0.6);
        out += '<line class="zero" x1="' + pad.l + '" y1="' + Y(0) + '" x2="' + (W - pad.r) + '" y2="' + Y(0) + '"/>';
        for (var j = 0; j < n; j++) {
          var v = diff[j], x = X(6 + 18 * j / (n - 1)) - bw / 2, y = v > 0 ? Y(v) : Y(0), h = Math.abs(Y(v) - Y(0));
          if (h < 0.3) continue;
          out += '<rect class="' + (v > 0 ? 'diffbar-pos' : 'diffbar-neg') + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '"/>';
        }
        out += '<text class="tick" x="' + (W - pad.r) + '" y="' + (pad.t + 10) + '" text-anchor="end">more at visit 2</text>' +
          '<text class="tick" x="' + (W - pad.r) + '" y="' + (H - pad.b - 6) + '" text-anchor="end">less at visit 2</text>';
        return out;
      }, small);
    new C.DayChart(document.getElementById('m-push'), { base: B.base, result: resB, mode: 'split', every: 30, meta: meta, height: small,
      label: 'The same change as pushes: arrows point right before 10 am, the same morning an hour later.' });


    // ---------------- step 4: one person's mix
    var person = D.cohort.filter(function (c) { return c.id === 18; })[0];
    var labels = ['1 · More or less, all day', '2 · Earlier, busier mornings', '3 · Late morning to late afternoon', '4 · Midday swings'];
    document.getElementById('m-mix-sub').textContent = 'Person #' + person.id + ' from the synthetic cohort: scores on the four patterns, in typical-person units.';
    var q = ['p1', 'p2', 'p3', 'p4'].map(function (k, i) { return k + '=' + person.z[i].toFixed(1); }).join('&');
    document.getElementById('m-mix-link').setAttribute('href', 'explorer.html?' + q);
    responsive(document.getElementById('m-mix'),
      'Person 18 scores: ' + person.z.map(function (z, i) { return labels[i] + ' ' + z.toFixed(1); }).join(', ') + '.',
      function (W) {
        var labW = W >= 520 ? 250 : 0, rowH = labW ? 34 : 56, top = 6, out = '';
        var x0 = labW + 8, x1 = W - 44, mid = (x0 + x1) / 2, unit = (x1 - x0) / 6;
        person.z.forEach(function (z, i) {
          var yb = top + i * rowH + (labW ? 8 : 26), w = Math.min(3, Math.abs(z)) * unit;
          if (labW) out += '<text class="mixlab" x="0" y="' + (yb + 13) + '">' + labels[i] + '</text>';
          else out += '<text class="mixlab" x="0" y="' + (yb - 8) + '">' + labels[i] + '</text>';
          out += '<line class="zero" x1="' + mid + '" y1="' + (yb - 3) + '" x2="' + mid + '" y2="' + (yb + 19) + '"/>';
          out += '<rect class="mixbar" x="' + (z < 0 ? mid - w : mid).toFixed(1) + '" y="' + yb + '" width="' + Math.max(1, w).toFixed(1) + '" height="16" rx="2"/>';
          out += '<text class="mixval" x="' + (z < 0 ? mid - w - 6 : mid + w + 6).toFixed(1) + '" y="' + (yb + 13) + '" text-anchor="' + (z < 0 ? 'end' : 'start') + '">' +
            (Math.abs(z) < 0.05 ? '' : (z < 0 ? '−' : '+')) + Math.abs(z).toFixed(1) + '</text>';
        });
        return out;
      }, function (W) { return W >= 520 ? 6 + 34 * 4 + 4 : 6 + 56 * 4 + 4; });
  }).catch(function (err) {
    console.error(err);
    var m = document.createElement('p');
    m.className = 'wrap small';
    m.textContent = 'The charts could not be drawn (' + err.message + '). If you opened the file directly, serve the folder over http, for example with: python3 -m http.server';
    document.getElementById('main').prepend(m);
  });
})();
