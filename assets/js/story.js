/* Reshaping the Day: story page. */
(function () {
  'use strict';
  var E = window.RTD.engine, C = window.RTD.charts;

  var PATTERNS = [
    { k: 'p1', title: 'More or less, all day', text: 'Activity rises or falls across the day, most between 10 am and 7 pm. This pattern mostly tracks total activity.' },
    { k: 'p2', title: 'Earlier, busier mornings', text: 'Morning activity starts earlier and grows, with slightly less in the afternoon.' },
    { k: 'p3', title: 'Late morning to late afternoon', text: 'Activity moves out of late morning and into early morning and late afternoon.' },
    { k: 'p4', title: 'Midday swings', text: 'Gains and losses alternate through the day, with the largest dip in early afternoon.' }
  ];

  function neg(p) { return { x: p.x.map(function (v) { return -v; }), y: p.y.map(function (v) { return -v; }) }; }

  fetch('data/synthetic.json').then(function (r) { return r.json(); }).then(function (D) {
    var meta = D.meta;
    function shoot(base, p, traj) { return E.shoot(base, p.x, p.y, { sigmas: meta.sigmas, nsteps: meta.nsteps, trajectory: traj }); }

    // ---------------- hero: morph along the geodesic path
    var heroRes = shoot(D.hero.base, D.hero.p, true);
    var hero = new C.DayChart(document.getElementById('hero-chart'), {
      base: D.hero.base, result: heroRes, mode: 'push', every: 20, meta: meta,
      label: 'One synthetic woman\'s average activity across the day at two visits. At visit 2 her mornings start later and her early-evening peak is lower.'
    });
    document.getElementById('hero-total').textContent =
      'Her daily total fell ' + Math.abs(E.pctChange(D.hero.base, heroRes, meta)).toFixed(1) + '%.';
    function play() {
      hero.q = { qx: heroRes.trajectory[0][0], qy: heroRes.trajectory[0][1] };
      hero.showArrows = false; hero.render();
      hero.animate(heroRes.trajectory, 2600);
    }
    setTimeout(play, 350);
    document.getElementById('replay').addEventListener('click', play);

    // ---------------- chapter 1: same total, different day
    var A = D.archetypes[0], B = D.archetypes[1];
    var resA = shoot(A.base, A.p), resB = shoot(B.base, B.p);
    var totA = E.pctChange(A.base, resA, meta), totB = E.pctChange(B.base, resB, meta);
    var small = function (W) { return Math.round(Math.min(Math.max(W * 0.5, 190), 280)); };
    new C.DayChart(document.getElementById('chart-a'), { base: A.base, result: resA, mode: 'split', every: 30, meta: meta, height: small,
      label: 'Person A: activity between 5 and 9 pm is lower at visit 2. Timing barely changes.' });
    new C.DayChart(document.getElementById('chart-b'), { base: B.base, result: resB, mode: 'split', every: 30, meta: meta, height: small,
      label: 'Person B: the morning rise happens later at visit 2. Before 10 am the pushes point right and down.' });
    document.querySelectorAll('.ab-total').forEach(function (el) { el.textContent = Math.abs(totA).toFixed(1) + '%'; });
    document.querySelector('.a-total').textContent = C.fmtPct(totA) + ' daily activity';
    document.querySelector('.b-total').textContent = C.fmtPct(totB) + ' daily activity';
    document.getElementById('bar-a').style.width = (100 + totA) + '%';
    document.getElementById('bar-b').style.width = (100 + totB) + '%';

    var bShape = document.getElementById('view-shape'), bTotal = document.getElementById('view-total');
    function setView(v) {
      bShape.setAttribute('aria-pressed', String(v === 'shape'));
      bTotal.setAttribute('aria-pressed', String(v === 'total'));
      document.getElementById('ch1-shape').hidden = v !== 'shape';
      document.getElementById('ch1-total').hidden = v !== 'total';
    }
    bShape.addEventListener('click', function () { setView('shape'); });
    bTotal.addEventListener('click', function () { setView('total'); });

    // ---------------- chapter 2: average change and the four patterns
    var resMean = shoot(D.typical, D.patterns.mean);
    new C.DayChart(document.getElementById('chart-mean'), { base: D.typical, result: resMean, mode: 'split', every: 30, meta: meta,
      height: function (W) { return Math.round(Math.min(Math.max(W * 0.45, 200), 320)); },
      label: 'Average change across the synthetic cohort. Visit 2 sits below visit 1 all day, with small sideways shifts.' });

    var host = document.getElementById('patterns');
    PATTERNS.forEach(function (P, i) {
      var card = document.createElement('article');
      card.className = 'card';
      card.innerHTML = '<div class="card-head"><h3>' + (i + 1) + ' · ' + P.title + '</h3><span class="share">' +
        Math.round(D.pve[P.k]) + '% of variation</span></div><div class="pchart" style="margin-top: 12px"></div><p>' + P.text +
        '</p><a href="explorer.html?' + P.k + '=1" style="display: inline-block; margin-top: 10px; font-weight: 600; font-size: 16px">Try it in the explorer</a>';
      host.appendChild(card);
      var plus = shoot(D.typical, D.patterns[P.k]), minus = shoot(D.typical, neg(D.patterns[P.k]));
      new C.DayChart(card.querySelector('.pchart'), {
        base: D.typical, baseClass: 'typ', result: plus, extras: [{ q: minus, cls: 'v1' }], mode: 'split', every: 60, meta: meta,
        ylims: [-0.34, 0.34], height: function (W) { return Math.round(Math.min(Math.max(W * 0.42, 170), 260)); },
        label: 'Pattern ' + (i + 1) + ', ' + P.title + ': ' + P.text
      });
    });

    // ---------------- chapter 3: direction-only schematics
    function scale(p, k) { return { x: p.x.map(function (v) { return k * v; }), y: p.y.map(function (v) { return k * v; }) }; }
    var less = shoot(D.typical, scale(D.patterns.p1, -1.6)), more = shoot(D.typical, scale(D.patterns.p1, 1.6));
    function glyph(x0, y0, w, h, res) {
      var n = D.typical.length, lo = -0.45, hi = 0.45;
      var X = function (hr) { return x0 + (hr - 6) / 18 * w; }, Y = function (v) { return y0 + (hi - v) / (hi - lo) * h; };
      var base = '', d = '';
      for (var j = 0; j < n; j++) {
        base += (j ? 'L' : 'M') + X(6 + 18 * j / (n - 1)).toFixed(1) + ',' + Y(D.typical[j]).toFixed(1);
        d += (j ? 'L' : 'M') + X(6 + (res.qx[j] + 1) * 9).toFixed(1) + ',' + Y(res.qy[j]).toFixed(1);
      }
      return '<path class="s-day-base" d="' + base + '"/><path class="s-day" d="' + d + '"/>';
    }
    function schematic(el, label, draw) {
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label);
      el.appendChild(svg);
      function render() {
        var W = Math.max(el.clientWidth || 400, 260), H = Math.round(Math.min(Math.max(W * 0.58, 220), 300));
        svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('width', W); svg.setAttribute('height', H);
        svg.innerHTML = draw(W, H);
      }
      render();
      if (window.ResizeObserver) new ResizeObserver(render).observe(el);
    }
    function frame(W, H, P, xlab) {
      var b = H - P.b;
      return '<line class="s-axis" x1="' + P.l + '" y1="' + b + '" x2="' + (W - P.r) + '" y2="' + b + '"/>' +
        '<line class="s-axis" x1="' + P.l + '" y1="' + P.t + '" x2="' + P.l + '" y2="' + b + '"/>' +
        '<text class="s-lab" x="' + (W - P.r) + '" y="' + (H - 6) + '" text-anchor="end">' + xlab + '</text>' +
        '<text class="s-lab" x="' + P.l + '" y="14">↑ Higher physical function</text>';
    }
    schematic(document.getElementById('schem-a'),
      'Illustration: the more a woman\'s activity held up or grew across the day, the higher her physical function at follow-up.',
      function (W, H) {
        var P = { l: 2, r: 8, t: 30, b: 74 }, pw = W - P.l - P.r, ph = H - P.t - P.b;
        var X = function (u) { return P.l + u * pw; }, Y = function (v) { return P.t + (1 - v) * ph; };
        var band = [[0.06, 0.12], [0.94, 0.70], [0.94, 0.94], [0.06, 0.34]].map(function (p) { return X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1); }).join(' ');
        var gw = Math.min(96, pw * 0.3), gh = 34, gy = H - P.b + 8;
        return frame(W, H, P, 'Pattern 1: less → more activity all day') +
          '<polygon class="s-band" points="' + band + '"/>' +
          '<line class="s-line" x1="' + X(0.06) + '" y1="' + Y(0.23) + '" x2="' + X(0.94) + '" y2="' + Y(0.82) + '"/>' +
          glyph(X(0.02), gy, gw, gh, less) + glyph(X(0.98) - gw, gy, gw, gh, more);
      });
    schematic(document.getElementById('schem-b'),
      'Illustration: in the later period, more change in the shape of the day went with higher physical function; in the earlier period the link was weaker.',
      function (W, H) {
        var P = { l: 2, r: 8, t: 30, b: 34 }, pw = W - P.l - P.r, ph = H - P.t - P.b;
        var X = function (u) { return P.l + u * pw; }, Y = function (v) { return P.t + (1 - v) * ph; };
        return frame(W, H, P, 'How much the day’s shape changed: less → more') +
          '<line class="s-line-2" x1="' + X(0.04) + '" y1="' + Y(0.40) + '" x2="' + X(0.96) + '" y2="' + Y(0.55) + '"/>' +
          '<line class="s-line" x1="' + X(0.04) + '" y1="' + Y(0.30) + '" x2="' + X(0.96) + '" y2="' + Y(0.90) + '"/>' +
          '<text class="s-end" x="' + X(0.96) + '" y="' + (Y(0.90) - 10) + '" text-anchor="end">Later period, older ages</text>' +
          '<text class="s-end-2" x="' + X(0.96) + '" y="' + (Y(0.55) + 22) + '" text-anchor="end">Earlier period</text>';
      });
  }).catch(function (err) {
    console.error(err);
    var m = document.createElement('p');
    m.className = 'wrap small';
    m.textContent = 'The charts could not be drawn (' + err.message + '). If you opened the file directly, serve the folder over http, for example with: python3 -m http.server';
    document.getElementById('main').prepend(m);
  });
})();
