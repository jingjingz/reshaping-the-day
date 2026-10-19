/* Reshaping the Day: explorer page. */
(function () {
  'use strict';
  var E = window.RTD.engine, C = window.RTD.charts;
  var KEYS = ['p1', 'p2', 'p3', 'p4'];

  function $(id) { return document.getElementById(id); }
  function fmtScore(v) { return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1); }

  fetch('data/synthetic.json').then(function (r) { return r.json(); }).then(function (D) {
    var meta = D.meta;
    function shoot(base, p) { return E.shoot(base, p.x, p.y, { sigma: meta.sigma, nsteps: meta.nsteps }); }
    var energies = D.cohort.map(function (c) { return c.energy; }).sort(function (a, b) { return a - b; });

    // ---------------- mixer
    var sliders = KEYS.map(function (k) { return $(k); });
    var outputs = KEYS.map(function (k, i) { return $('o' + (i + 1)); });
    var avg = $('avg');
    var chart = new C.DayChart($('mix-chart'), {
      base: D.typical, result: shoot(D.typical, D.patterns.mean), mode: 'split', every: 20, meta: meta,
      height: function (W) { return Math.round(Math.min(Math.max(W * 0.55, 220), 500)); },
      label: 'A typical day at visit 1 and after the chosen pattern mix at visit 2.'
    });
    var scatter;

    function scores() { return sliders.map(function (s) { return parseFloat(s.value) || 0; }); }

    function update() {
      var z = scores();
      z.forEach(function (v, i) { outputs[i].textContent = fmtScore(v); });
      var p = E.mix(D.patterns, z, avg.checked);
      var res = E.shoot(D.typical, p.x, p.y, { sigma: meta.sigma, nsteps: meta.nsteps });
      chart.update({ result: res });
      $('s-total').textContent = C.fmtPct(E.pctChange(D.typical, res, meta));
      var pct = E.percentileOf(E.energy(p.x, p.y, meta), energies);
      $('s-energy').textContent = Math.round(pct) + '%';
      $('s-energy-k').textContent = 'of the synthetic cohort changed less overall';
      var shift = E.timingShift(D.typical, res);
      $('s-shift').textContent = Math.abs(shift) < 1 ? 'None' : Math.round(Math.abs(shift)) + ' min ' + (shift > 0 ? 'later' : 'earlier');
      var q = new URLSearchParams();
      z.forEach(function (v, i) { if (v) q.set(KEYS[i], v.toFixed(1)); });
      if (!avg.checked) q.set('avg', '0');
      var qs = q.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    }
    var pending = false;
    function schedule() { if (!pending) { pending = true; requestAnimationFrame(function () { pending = false; update(); }); } }
    sliders.forEach(function (s) { s.addEventListener('input', function () { $('loaded').textContent = ''; schedule(); }); });
    avg.addEventListener('change', schedule);

    function setScores(z) {
      sliders.forEach(function (s, i) { s.value = Math.max(-3, Math.min(3, Math.round((z[i] || 0) * 10) / 10)); });
      update();
    }
    function loadPerson(person) {
      avg.checked = true;
      setScores(person.z);
      $('loaded').textContent = 'Loaded person #' + person.id + ' from the cohort.';
      if (scatter) scatter.select(D.cohort.indexOf(person));
    }
    $('reset').addEventListener('click', function () { avg.checked = true; $('loaded').textContent = ''; setScores([0, 0, 0, 0]); });
    $('random').addEventListener('click', function () { loadPerson(D.cohort[Math.floor(Math.random() * D.cohort.length)]); });

    // initial state from the URL, e.g. explorer.html?p1=1
    var params = new URLSearchParams(location.search);
    if (params.get('avg') === '0') avg.checked = false;
    setScores(KEYS.map(function (k) { return parseFloat(params.get(k)) || 0; }));

    // ---------------- compare
    var options = D.archetypes.map(function (a) { return { id: a.id, name: a.name, blurb: a.blurb, base: a.base, p: a.p }; });
    options.push({ id: 'random', name: 'Random person', random: true });
    var chosen = [0, 1], randomPerson = null;
    var chipsHost = $('chips');
    options.forEach(function (o, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = o.name;
      b.addEventListener('click', function () {
        if (o.random) randomPerson = D.cohort[Math.floor(Math.random() * D.cohort.length)];
        if (chosen.indexOf(i) === -1) chosen = [chosen[1], i];
        renderCompare();
      });
      chipsHost.appendChild(b);
    });
    function shiftText(s) {
      if (Math.abs(s.maxShift) < 6) return 'timing unchanged';
      return 'up to ' + Math.round(Math.abs(s.maxShift)) + ' min ' + (s.maxShift > 0 ? 'later' : 'earlier') + ' near ' + E.clock(s.maxShiftAt);
    }
    function renderCompare() {
      chipsHost.querySelectorAll('.chip').forEach(function (b, i) { b.setAttribute('aria-pressed', String(chosen.indexOf(i) !== -1)); });
      var grid = $('compare-grid');
      grid.innerHTML = '';
      chosen.forEach(function (i) {
        var o = options[i], base, p, name = o.name, blurb = o.blurb;
        if (o.random) {
          base = D.typical; p = E.mix(D.patterns, randomPerson.z, true);
          p = { x: Array.from(p.x), y: Array.from(p.y) };
          name = 'Person #' + randomPerson.id; blurb = 'Drawn at random from the synthetic cohort.';
        } else { base = o.base; p = o.p; }
        var res = shoot(base, p), s = E.summarize(base, res, meta);
        var fig = document.createElement('figure');
        fig.style.margin = '0';
        var holder = document.createElement('div');
        var cap = document.createElement('figcaption');
        cap.innerHTML = '<strong></strong> · total <span class="t"></span> · <span class="sh"></span><br><span class="bl"></span>';
        cap.querySelector('strong').textContent = name;
        cap.querySelector('.t').textContent = C.fmtPct(s.total);
        cap.querySelector('.sh').textContent = shiftText(s);
        cap.querySelector('.bl').textContent = blurb;
        fig.appendChild(holder); fig.appendChild(cap); grid.appendChild(fig);
        new C.DayChart(holder, { base: base, result: res, mode: 'split', every: 40, meta: meta,
          height: function (W) { return Math.round(Math.min(Math.max(W * 0.6, 170), 240)); },
          label: name + ': ' + blurb });
      });
    }
    renderCompare();

    // ---------------- cohort
    scatter = new C.Scatter($('scatter'), D.cohort, {
      onSelect: function (person) { loadPerson(person); $('mix').scrollIntoView({ behavior: 'smooth', block: 'start' }); },
      label: 'Scatter of 300 synthetic people by pattern 1 (less to more activity) and pattern 2 (later to earlier mornings). Color shows how much each day changed.'
    });
    $('pick').addEventListener('submit', function () {
      var id = parseInt($('pick-id').value, 10);
      var person = D.cohort.filter(function (c) { return c.id === id; })[0];
      if (person) { loadPerson(person); $('mix').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      else $('loaded').textContent = 'Choose a person number from 1 to 300.';
    });

    // tabs follow the section in view
    var tabs = document.querySelectorAll('.tabs a');
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          tabs.forEach(function (t) { t.setAttribute('aria-current', String(t.getAttribute('href') === '#' + en.target.id)); });
        });
      }, { rootMargin: '-40% 0px -55% 0px' });
      ['mix', 'compare', 'cohort'].forEach(function (id) { io.observe($(id)); });
    }
  }).catch(function (err) {
    var m = document.createElement('p');
    m.className = 'small';
    m.textContent = 'The explorer could not load its data (' + err.message + '). Serve the site over http, for example with: python3 -m http.server';
    document.getElementById('main').prepend(m);
  });
})();
