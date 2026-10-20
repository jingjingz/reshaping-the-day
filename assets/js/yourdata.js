/* Reshaping the Day: try your own data. Everything runs in the browser. */
(function () {
  'use strict';
  var E = window.RTD.engine, C = window.RTD.charts, P = window.RTD.pre, F = window.RTD.fit;
  var KEYS = ['p1', 'p2', 'p3', 'p4'];
  var LABELS = ['1 · More or less, all day', '2 · Earlier, busier mornings', '3 · Late morning to late afternoon', '4 · Midday swings'];
  function $(id) { return document.getElementById(id); }
  function status(msg) { $('status').textContent = msg; }
  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(new Error('Could not read ' + file.name + '.')); };
      r.readAsText(file);
    });
  }

  var D = null, texts = [null, null], names = ['', ''], pushChart = null, daysEl = null;

  fetch('data/synthetic.json').then(function (r) { return r.json(); }).then(function (data) {
    D = data;

    function refreshButton() { $('run').disabled = !(texts[0] && texts[1]); }
    [0, 1].forEach(function (i) {
      $('f' + (i + 1)).addEventListener('change', function (ev) {
        var f = ev.target.files[0];
        if (!f) { texts[i] = null; refreshButton(); return; }
        readFile(f).then(function (t) {
          texts[i] = t; names[i] = f.name; refreshButton();
          status(texts[0] && texts[1] ? 'Both files are ready.' : 'Now choose the ' + (i ? 'first' : 'second') + ' visit.');
        }).catch(function (e) { status(e.message); });
      });
    });
    $('clear').addEventListener('click', function () {
      texts = [null, null]; $('f1').value = ''; $('f2').value = ''; $('results').hidden = true; refreshButton();
      status('Choose two files, or use a sample person.');
    });
    $('sample').addEventListener('click', function () {
      var toCounts = function (g) { return P.fromGrid(Array.from(g, function (v) { return D.meta.grand_mean + D.meta.four_sd * v; })); };
      texts = [P.sampleCSV(toCounts(D.hero.base), 7, 101, '2023-04-03'), P.sampleCSV(toCounts(D.hero.target), 7, 202, '2026-04-06')];
      names = ['sample visit 1', 'sample visit 2'];
      $('f1').value = ''; $('f2').value = ''; refreshButton();
      run();
    });
    $('run').addEventListener('click', run);

    function visitCard(i, v) {
      var avgWear = v.days.filter(function (d) { return d.valid; }).reduce(function (s, d) { return s + d.wearHours; }, 0) / Math.max(1, v.nValid);
      var note = v.nValid < 4 ? '<p class="warn">Fewer than four valid days. The average day may be unstable.</p>' : '';
      var card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = '<h3>Visit ' + (i + 1) + '</h3><p class="sub"></p>' +
        '<ul class="facts" style="margin-top: 8px"><li><strong>Days found</strong> ' + v.days.length + '</li>' +
        '<li><strong>Valid days</strong> ' + v.nValid + '</li><li><strong>Average wear</strong> ' + avgWear.toFixed(1) + ' hours, 6 am to midnight</li>' +
        '<li><strong>Uncertainty</strong> about \u00b1' + Math.round(v.noiseCounts) + ' counts per minute in the average day</li></ul>' + note;
      card.querySelector('.sub').textContent = names[i];
      return card;
    }

    function run() {
      if (!(texts[0] && texts[1])) return;
      $('run').disabled = true;
      status('Reading the files…');
      setTimeout(function () {
        var visits;
        try {
          visits = texts.map(function (t, i) {
            var parsed;
            try { parsed = P.parseCounts(t); } catch (e) { throw new Error('Visit ' + (i + 1) + ': ' + e.message); }
            var v = P.averageDay(parsed.days);
            if (!v.nValid) throw new Error('Visit ' + (i + 1) + ' has no day with 14 or more hours of wear between 6 am and midnight.');
            v.smooth = P.whittaker(v.curve, 25);
            return v;
          });
        } catch (e) { status(e.message); refreshButton(); return; }

        // Scaling: the cohort's constants for ActiGraph-like counts, otherwise match the cohort's range
        var pooled = Array.from(visits[0].smooth).concat(Array.from(visits[1].smooth));
        var mean = pooled.reduce(function (s, v) { return s + v; }, 0) / pooled.length;
        var lo = Math.min.apply(null, pooled), hi = Math.max.apply(null, pooled);
        var cohortScale = mean >= 50 && mean <= 2000;
        var center = cohortScale ? D.meta.grand_mean : mean, spread = cohortScale ? D.meta.four_sd : Math.max(1e-9, (hi - lo) / 0.45);
        var grids = visits.map(function (v) { return Array.from(P.toGrid(v.smooth), function (x) { return (x - center) / spread; }); });
        // day-to-day noise of each average day, in scaled units; the fit ignores wiggles within it
        var ms = visits.map(function (v) {
          if (!v.se) return Math.pow(0.05 * spread, 2);
          var g = P.toGrid(v.se), s2 = 0;
          for (var j = 0; j < g.length; j++) s2 += g[j] * g[j];
          return s2 / g.length;
        });
        visits.forEach(function (v, i) { v.noiseCounts = Math.sqrt(ms[i]); });
        var noise = Math.max(0.01, Math.sqrt(ms[0] + ms[1]) / spread);

        status('Fitting the pushes between the visits…');
        $('progress').hidden = false; $('progress-bar').style.width = '4%';
        // noisy single-person curves get a firmer energy penalty than the clean synthetic ones
        var opts = { sigmas: D.meta.sigmas, nsteps: D.meta.nsteps, gamma: 1000, noise: noise, maxIter: 60 };
        fitAsync(grids[0], grids[1], opts, function (frac) { $('progress-bar').style.width = Math.round(4 + 96 * frac) + '%'; })
          .then(function (fit) {
            $('progress').hidden = true;
            show(visits, grids, fit, cohortScale);
            status('Done. Scroll down for the results.');
            refreshButton();
          })
          .catch(function (e) { $('progress').hidden = true; status('The fit did not finish: ' + e.message); refreshButton(); });
      }, 30);
    }

    // Fit in a worker when possible, otherwise on the page
    function fitAsync(base, target, opts, onFrac) {
      return new Promise(function (resolve, reject) {
        var worker = null;
        try { worker = new Worker('assets/js/fit-worker.js'); } catch (e) { worker = null; }
        if (!worker) {
          try { resolve(F.fitDeformation(base, target, opts)); } catch (e) { reject(e); }
          return;
        }
        worker.onmessage = function (ev) {
          var m = ev.data;
          if (m.type === 'progress') onFrac(Math.min(1, m.it / 12));
          else if (m.type === 'done') { worker.terminate(); resolve(m); }
          else if (m.type === 'error') { worker.terminate(); reject(new Error(m.message)); }
        };
        worker.onerror = function () {
          worker.terminate();
          try { resolve(F.fitDeformation(base, target, opts)); } catch (e) { reject(e); }
        };
        worker.postMessage({ base: base, target: target, opts: opts });
      });
    }

    function show(visits, grids, fit, cohortScale) {
      $('results').hidden = false;
      var cards = $('visit-cards');
      cards.innerHTML = '';
      visits.forEach(function (v, i) { cards.appendChild(visitCard(i, v)); });

      // average days in counts
      var host = $('days-chart');
      host.innerHTML = '';
      daysEl = document.createElement('div');
      host.appendChild(daysEl);
      drawDays(daysEl, visits);

      var meta = D.meta, base = grids[0];
      var res = E.shoot(base, fit.p.x, fit.p.y, { sigmas: meta.sigmas, nsteps: meta.nsteps });
      var cfg = { base: base, result: res, mode: 'split', every: 20, meta: meta,
        ylims: (function () {
          var all = base.concat(Array.from(res.qy)), mn = Math.min.apply(null, all), mx = Math.max.apply(null, all), pad = (mx - mn) * 0.12;
          return [mn - pad, mx + pad];
        })(),
        label: 'Your average day at visit 1 and visit 2 with the fitted pushes between them.' };
      var ph = $('push-chart');
      ph.innerHTML = '';
      pushChart = new C.DayChart(ph, cfg);

      var t1 = visits[0].smooth.reduce(function (s, v) { return s + v; }, 0), t2 = visits[1].smooth.reduce(function (s, v) { return s + v; }, 0);
      $('r-total').textContent = C.fmtPct(100 * (t2 - t1) / t1);
      var s = E.summarize(base, res, meta, 45);
      if (Math.abs(s.maxShift) < 6) { $('r-shift').textContent = 'Under 6 min'; $('r-shift-k').textContent = 'Largest timing shift'; }
      else {
        $('r-shift').textContent = Math.round(Math.abs(s.maxShift)) + ' min ' + (s.maxShift > 0 ? 'later' : 'earlier');
        $('r-shift-k').textContent = 'Largest timing shift, near ' + E.clock(s.maxShiftAt);
      }
      var avgShift = E.timingShift(base, res);
      $('r-energy').textContent = Math.abs(avgShift) < 1 ? 'Under 1 min' : Math.round(Math.abs(avgShift)) + ' min ' + (avgShift > 0 ? 'later' : 'earlier');
      $('r-energy-k').textContent = 'Average timing shift, weighted by activity';

      var proj = F.projectPatterns(fit.p, D.patterns);
      $('mix-explained').textContent = 'Beyond the average change, these four patterns account for ' + Math.round(100 * proj.explained) + '% of your change.';
      var rows = $('mix-rows');
      rows.innerHTML = '';
      proj.scores.forEach(function (z, i) {
        var row = document.createElement('div');
        row.className = 'mixrow';
        var w = Math.min(3, Math.abs(z)) / 3 * 50;
        row.innerHTML = '<div class="mixrow-label"></div><div class="mixrow-track"><span class="mixrow-zero"></span>' +
          '<span class="mixrow-bar" style="' + (z < 0 ? 'right: 50%;' : 'left: 50%;') + ' width: ' + w.toFixed(1) + '%"></span></div>' +
          '<div class="mixrow-val"></div>';
        row.querySelector('.mixrow-label').textContent = LABELS[i];
        row.querySelector('.mixrow-val').textContent = (Math.abs(z) < 0.05 ? '' : (z < 0 ? '−' : '+')) + Math.abs(z).toFixed(1);
        rows.appendChild(row);
      });
      var q = KEYS.map(function (k, i) { return k + '=' + Math.max(-3, Math.min(3, proj.scores[i])).toFixed(1); }).join('&');
      $('mix-link').setAttribute('href', 'explorer.html?' + q);
      $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function drawDays(el, visits) {
      el.classList.add('chart');
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', 'Your average day at each visit, in counts per minute.');
      el.appendChild(svg);
      function bin5(v) {
        var out = [];
        for (var i = 0; i < v.length; i += 5) { var s = 0, n = 0; for (var k = i; k < Math.min(v.length, i + 5); k++) { s += v[k]; n++; } out.push(s / n); }
        return out;
      }
      var raws = visits.map(function (v) { return bin5(v.curve); });
      var ymax = Math.max.apply(null, raws[0].concat(raws[1]).concat(Array.from(visits[0].smooth)).concat(Array.from(visits[1].smooth))) * 1.08;
      function render() {
        var W = Math.max(el.clientWidth || 600, 260), H = Math.round(Math.min(Math.max(W * 0.34, 200), 340));
        var pad = { t: 18, r: 10, b: 30, l: 44 }, b = H - pad.b;
        var X = function (h) { return pad.l + (h - 6) / 18 * (W - pad.l - pad.r); };
        var Y = function (v) { return pad.t + (1 - v / ymax) * (H - pad.t - pad.b); };
        var ticks = W >= 600 ? [6, 9, 12, 15, 18, 21, 24] : [6, 12, 18, 24];
        var names = { 6: '6 am', 9: '9 am', 12: 'noon', 15: '3 pm', 18: '6 pm', 21: '9 pm', 24: 'midnight' }, out = '';
        ticks.forEach(function (t) {
          var anchor = t === 6 ? 'start' : (t === 24 ? 'end' : 'middle');
          out += '<line class="grid" x1="' + X(t) + '" y1="' + pad.t + '" x2="' + X(t) + '" y2="' + b + '"/><text class="tick" x="' + X(t) + '" y="' + (b + 19) + '" text-anchor="' + anchor + '">' + names[t] + '</text>';
        });
        var step = ymax > 1500 ? 1000 : (ymax > 600 ? 500 : (ymax > 200 ? 100 : 50));
        for (var v = 0; v <= ymax; v += step) out += '<text class="tick" x="' + (pad.l - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + v.toLocaleString() + '</text>';
        out += '<text class="tick" x="' + pad.l + '" y="' + (pad.t - 6) + '">counts per minute</text>';
        out += '<line class="axis" x1="' + pad.l + '" y1="' + b + '" x2="' + (W - pad.r) + '" y2="' + b + '"/>';
        visits.forEach(function (vv, i) {
          if (!vv.se) return;
          var up = '', dn = '';
          for (var t = 0; t < vv.smooth.length; t += 4) {
            var x = X(6 + t / 60).toFixed(1);
            up += (t ? 'L' : 'M') + x + ',' + Y(Math.max(0, vv.smooth[t] + 2 * vv.se[t])).toFixed(1);
            dn = 'L' + x + ',' + Y(Math.max(0, vv.smooth[t] - 2 * vv.se[t])).toFixed(1) + dn;
          }
          out += '<path class="' + (i ? 'band-2' : 'band-1') + '" d="' + up + dn + 'Z"/>';
        });
        raws.forEach(function (r) {
          var d = '';
          r.forEach(function (val, i) { d += (i ? 'L' : 'M') + X(6 + (i * 5 + 2.5) / 60).toFixed(1) + ',' + Y(val).toFixed(1); });
          out += '<path class="raw" d="' + d + '"/>';
        });
        visits.forEach(function (vv, i) {
          var d = '';
          for (var t = 0; t < vv.smooth.length; t += 2) d += (t ? 'L' : 'M') + X(6 + t / 60).toFixed(1) + ',' + Y(Math.max(0, vv.smooth[t])).toFixed(1);
          out += '<path class="' + (i ? 'v2' : 'v1') + '" d="' + d + '"/>';
        });
        svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('width', W); svg.setAttribute('height', H);
        svg.innerHTML = out;
      }
      render();
      if (window.ResizeObserver) new ResizeObserver(render).observe(el);
    }
  }).catch(function (err) {
    console.error(err);
    status('The page could not start (' + err.message + '). If you opened the file directly, serve the folder over http, for example with: python3 -m http.server');
  });
})();
