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
    function shoot(base, p, traj) { return E.shoot(base, p.x, p.y, { sigma: meta.sigma, nsteps: meta.nsteps, trajectory: traj }); }

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
      label: 'Person B: the morning rise happens about an hour later at visit 2.' });
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
  }).catch(function (err) {
    var m = document.createElement('p');
    m.className = 'wrap small';
    m.textContent = 'The charts could not load their data (' + err.message + '). Serve the site over http, for example with: python3 -m http.server';
    document.getElementById('main').prepend(m);
  });
})();
