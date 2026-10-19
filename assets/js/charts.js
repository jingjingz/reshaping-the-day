/*
 * Reshaping the Day: charts. Plain SVG, no dependencies.
 * DayChart draws a day at two visits with the pushes between them, a hover
 * readout of each push, and an animated morph along the geodesic path.
 * Scatter draws the synthetic cohort.
 */
(function (root) {
  'use strict';
  var E = root.RTD.engine;
  var SVGNS = 'http://www.w3.org/2000/svg';
  var reduceMotion = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var TICKS = { 6: '6 am', 9: '9 am', 12: 'noon', 15: '3 pm', 18: '6 pm', 21: '9 pm', 24: 'midnight' };

  function fmtPct(v, digits) {
    var d = digits == null ? 1 : digits, a = Math.abs(v).toFixed(d);
    if (Number(a) === 0) return '0%';
    return (v < 0 ? '−' : '+') + a + '%';
  }
  function timingText(m) {
    if (Math.abs(m) < 1) return 'Same time';
    return Math.round(Math.abs(m)) + ' min ' + (m > 0 ? 'later' : 'earlier');
  }
  function amountText(p) {
    if (Math.abs(p) < 1) return 'About the same activity';
    return Math.round(Math.abs(p)) + '% ' + (p > 0 ? 'more' : 'less') + ' activity';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ------------------------------------------------------------------ DayChart
  function DayChart(el, cfg) {
    this.el = el;
    this.cfg = cfg;
    this.q = cfg.result || null;     // current visit-2 control points
    this.showArrows = true;
    el.classList.add('chart');
    this.svg = document.createElementNS(SVGNS, 'svg');
    this.svg.setAttribute('role', 'img');
    this.svg.setAttribute('aria-label', cfg.label || 'Activity across the day at two visits');
    el.appendChild(this.svg);
    if (cfg.hover !== false) {
      this.tip = document.createElement('div');
      this.tip.className = 'tooltip';
      this.tip.hidden = true;
      this.tip.setAttribute('aria-hidden', 'true');
      el.appendChild(this.tip);
    }
    var self = this;
    if (root.ResizeObserver) {
      var lastW = 0;
      new ResizeObserver(function () {
        var w = el.clientWidth;
        if (Math.abs(w - lastW) > 1) { lastW = w; self.render(); }
      }).observe(el);
    }
    this.render();
  }

  DayChart.prototype.update = function (cfg) {
    for (var k in cfg) this.cfg[k] = cfg[k];
    if (cfg.result) this.q = cfg.result;
    this.render();
  };

  DayChart.prototype.layout = function () {
    var W = Math.max(this.el.clientWidth || 600, 260);
    var H = this.cfg.height ? this.cfg.height(W) : Math.round(Math.min(Math.max(W * 0.36, 190), 440));
    var pad = { t: 14, r: 12, b: 30, l: 12 };
    var yl = this.cfg.ylims || [-0.36, 0.42];
    return {
      W: W, H: H, pad: pad,
      X: function (h) { return pad.l + (h - 6) / 18 * (W - pad.l - pad.r); },
      Y: function (v) { return pad.t + (yl[1] - v) / (yl[1] - yl[0]) * (H - pad.t - pad.b); },
      Hinv: function (x) { return 6 + (x - pad.l) / (W - pad.l - pad.r) * 18; }
    };
  };

  function hourOf(j, n) { return 6 + 18 * j / (n - 1); }
  function hourOfQ(qx) { return 6 + (qx + 1) * 9; }

  function pathGrid(L, ys) {
    var n = ys.length, d = '';
    for (var j = 0; j < n; j++) d += (j ? 'L' : 'M') + L.X(hourOf(j, n)).toFixed(1) + ',' + L.Y(ys[j]).toFixed(1);
    return d;
  }
  function pathQ(L, q) {
    var d = '';
    for (var j = 0; j < q.qx.length; j++) d += (j ? 'L' : 'M') + L.X(hourOfQ(q.qx[j])).toFixed(1) + ',' + L.Y(q.qy[j]).toFixed(1);
    return d;
  }
  function arrow(x0, y0, x1, y1, cls, width, head) {
    var dx = x1 - x0, dy = y1 - y0, len = Math.sqrt(dx * dx + dy * dy);
    if (len < 2.5) return '';
    var ux = dx / len, uy = dy / len, hx = x1 - head * ux, hy = y1 - head * uy;
    var px = -uy * head * 0.55, py = ux * head * 0.55;
    return '<line class="' + cls + '" x1="' + x0.toFixed(1) + '" y1="' + y0.toFixed(1) + '" x2="' + hx.toFixed(1) + '" y2="' + hy.toFixed(1) +
      '" stroke-width="' + width + '" stroke-linecap="round"/>' +
      '<path class="' + cls + '" stroke="none" d="M' + x1.toFixed(1) + ',' + y1.toFixed(1) + 'L' + (hx + px).toFixed(1) + ',' + (hy + py).toFixed(1) +
      'L' + (hx - px).toFixed(1) + ',' + (hy - py).toFixed(1) + 'Z"/>';
  }

  DayChart.prototype.render = function () {
    var c = this.cfg, L = this.layout(), W = L.W, H = L.H, n = c.base.length, out = [];
    this.L = L;
    this.svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    this.svg.setAttribute('width', W);
    this.svg.setAttribute('height', H);
    var ticks = W >= 600 ? [6, 9, 12, 15, 18, 21, 24] : [6, 12, 18, 24];
    var base = H - L.pad.b;
    ticks.forEach(function (t) {
      var x = L.X(t);
      out.push('<line class="grid" x1="' + x + '" y1="' + L.pad.t + '" x2="' + x + '" y2="' + base + '"/>');
      var anchor = t === 6 ? 'start' : (t === 24 ? 'end' : 'middle');
      out.push('<text class="tick" x="' + x + '" y="' + (base + 19) + '" text-anchor="' + anchor + '">' + TICKS[t] + '</text>');
    });
    out.push('<line class="axis" x1="' + L.pad.l + '" y1="' + base + '" x2="' + (W - L.pad.r) + '" y2="' + base + '"/>');
    (c.extras || []).forEach(function (e) {
      out.push('<path class="' + e.cls + '" d="' + (e.q ? pathQ(L, e.q) : pathGrid(L, e.y)) + '"/>');
    });
    out.push('<path class="' + (c.baseClass || 'v1') + '" d="' + pathGrid(L, c.base) + '"/>');
    if (this.q) out.push('<path class="v2" d="' + pathQ(L, this.q) + '"/>');
    if (this.q && this.showArrows && c.mode && c.mode !== 'none') {
      var wide = W >= 600, every = Math.max(1, Math.round((c.every || 30) * (wide ? 1 : 1.5) / 5));
      var head = wide ? 4.5 : 3.6;
      for (var j = Math.floor(every / 2); j < n; j += every) {
        var x0 = L.X(hourOf(j, n)), y0 = L.Y(c.base[j]);
        var x1 = L.X(hourOfQ(this.q.qx[j])), y1 = L.Y(this.q.qy[j]);
        if (c.mode === 'push') out.push(arrow(x0, y0, x1, y1, 'a-push', 1.4, head));
        else {
          out.push(arrow(x0, y0, x1, y0, 'a-timing', 1.8, head - 0.5));
          out.push(arrow(x1, y0, x1, y1, 'a-amount', 1.8, head - 0.5));
        }
      }
    }
    if (this.tip) {
      out.push('<g class="hover" visibility="hidden"><line class="cross" y1="' + L.pad.t + '" y2="' + base + '"/>' +
        '<circle class="dot-v1" r="4.5"/><circle class="dot-v2" r="4.5"/></g>');
      out.push('<rect class="hit" x="0" y="0" width="' + W + '" height="' + H + '"/>');
    }
    this.svg.innerHTML = out.join('');
    if (this.tip) this.bindHover();
  };

  DayChart.prototype.bindHover = function () {
    var self = this, hit = this.svg.querySelector('.hit'), g = this.svg.querySelector('.hover');
    var cross = g.querySelector('.cross'), d1 = g.querySelector('.dot-v1'), d2 = g.querySelector('.dot-v2');
    function show(ev) {
      if (!self.q) return;
      var rect = self.svg.getBoundingClientRect(), L = self.L, n = self.cfg.base.length;
      var x = (ev.clientX - rect.left) * (L.W / rect.width);
      var h = Math.min(24, Math.max(6, L.Hinv(x)));
      var j = Math.round((h - 6) / 18 * (n - 1));
      var hx = L.X(hourOf(j, n)), qx = L.X(hourOfQ(self.q.qx[j])), qy = L.Y(self.q.qy[j]);
      cross.setAttribute('x1', hx); cross.setAttribute('x2', hx);
      d1.setAttribute('cx', hx); d1.setAttribute('cy', L.Y(self.cfg.base[j]));
      d2.setAttribute('cx', qx); d2.setAttribute('cy', qy);
      g.setAttribute('visibility', 'visible');
      var push = E.pushAt(j, self.cfg.base, self.q, self.cfg.meta);
      self.tip.innerHTML = '<strong>' + esc(E.clock(push.clockMinute)) + ' at visit 1</strong>' +
        '<div class="t-timing">' + esc(timingText(push.minutes)) + '</div>' +
        '<div class="t-amount">' + esc(amountText(push.pct)) + '</div>';
      self.tip.hidden = false;
      var tw = self.tip.offsetWidth, cw = self.el.clientWidth;
      var left = (ev.clientX - rect.left) + 14;
      if (left + tw > cw) left = (ev.clientX - rect.left) - tw - 14;
      self.tip.style.left = Math.max(0, left) + 'px';
      self.tip.style.top = Math.max(0, (ev.clientY - rect.top) - 70) + 'px';
    }
    function hide() { g.setAttribute('visibility', 'hidden'); self.tip.hidden = true; }
    hit.addEventListener('pointermove', show);
    hit.addEventListener('pointerdown', show);
    hit.addEventListener('pointerleave', hide);
  };

  // Morph visit 1 into visit 2 along the geodesic path, then reveal the pushes
  DayChart.prototype.animate = function (trajectory, ms, done) {
    var self = this, final = this.cfg.result;
    if (reduceMotion || !trajectory) { this.q = final; this.showArrows = true; this.render(); if (done) done(); return; }
    var F = trajectory.length, t0 = null, dur = ms || 2600;
    if (this._raf) cancelAnimationFrame(this._raf);
    this.showArrows = false;
    function frame(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      var e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      var f = e * (F - 1), i = Math.min(F - 2, Math.floor(f)), w = f - i;
      var a = trajectory[i], b = trajectory[i + 1], n = a[0].length;
      var qx = new Float64Array(n), qy = new Float64Array(n);
      for (var j = 0; j < n; j++) { qx[j] = a[0][j] + w * (b[0][j] - a[0][j]); qy[j] = a[1][j] + w * (b[1][j] - a[1][j]); }
      self.q = { qx: qx, qy: qy };
      if (p >= 1) { self.q = final; self.showArrows = true; }
      self.render();
      if (p < 1) self._raf = requestAnimationFrame(frame); else if (done) done();
    }
    this._raf = requestAnimationFrame(frame);
  };

  // ------------------------------------------------------------------ Scatter
  function Scatter(el, people, opts) {
    this.el = el; this.people = people; this.opts = opts || {}; this.selected = null;
    el.classList.add('chart', 'scatter');
    this.svg = document.createElementNS(SVGNS, 'svg');
    this.svg.setAttribute('role', 'img');
    this.svg.setAttribute('aria-label', this.opts.label || 'Synthetic cohort');
    el.appendChild(this.svg);
    this.tip = document.createElement('div');
    this.tip.className = 'tooltip'; this.tip.hidden = true; this.tip.setAttribute('aria-hidden', 'true');
    el.appendChild(this.tip);
    var self = this;
    if (root.ResizeObserver) new ResizeObserver(function () { self.render(); }).observe(el);
    this.render();
  }
  Scatter.prototype.render = function () {
    var W = Math.max(this.el.clientWidth || 420, 260), H = Math.round(Math.min(W * 0.78, 400));
    var P = { l: 40, r: 10, t: 10, b: 36 }, self = this, out = [];
    var X = function (z) { return P.l + (Math.max(-3, Math.min(3, z)) + 3) / 6 * (W - P.l - P.r); };
    var Y = function (z) { return (H - P.b) - (Math.max(-3, Math.min(3, z)) + 3) / 6 * (H - P.t - P.b); };
    this.X = X; this.Y = Y;
    this.svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    this.svg.setAttribute('width', W); this.svg.setAttribute('height', H);
    out.push('<line class="grid" x1="' + X(0) + '" y1="' + P.t + '" x2="' + X(0) + '" y2="' + (H - P.b) + '"/>');
    out.push('<line class="grid" x1="' + P.l + '" y1="' + Y(0) + '" x2="' + (W - P.r) + '" y2="' + Y(0) + '"/>');
    out.push('<line class="axis" x1="' + P.l + '" y1="' + (H - P.b) + '" x2="' + (W - P.r) + '" y2="' + (H - P.b) + '"/>');
    out.push('<line class="axis" x1="' + P.l + '" y1="' + P.t + '" x2="' + P.l + '" y2="' + (H - P.b) + '"/>');
    out.push('<text class="tick" x="' + (W - P.r) + '" y="' + (H - 10) + '" text-anchor="end">pattern 1: less → more activity</text>');
    out.push('<text class="tick" x="14" y="' + P.t + '" text-anchor="end" transform="rotate(-90 14 ' + P.t + ')">pattern 2: later → earlier mornings</text>');
    this.people.forEach(function (p, i) {
      var cls = 'pt c' + Math.min(5, 1 + Math.floor(p.energy_pct / 20));
      out.push('<circle class="' + cls + '" data-i="' + i + '" cx="' + X(p.z[0]).toFixed(1) + '" cy="' + Y(p.z[1]).toFixed(1) + '" r="4.5"/>');
    });
    if (this.selected != null) {
      var s = this.people[this.selected];
      out.push('<circle class="sel" cx="' + X(s.z[0]) + '" cy="' + Y(s.z[1]) + '" r="9"/>');
    }
    this.svg.innerHTML = out.join('');
    this.svg.querySelectorAll('.pt').forEach(function (c) {
      c.addEventListener('pointerenter', function (ev) { self.hover(ev, +c.getAttribute('data-i')); });
      c.addEventListener('pointerleave', function () { self.tip.hidden = true; });
      c.addEventListener('click', function () { var i = +c.getAttribute('data-i'); self.select(i); if (self.opts.onSelect) self.opts.onSelect(self.people[i]); });
    });
  };
  Scatter.prototype.hover = function (ev, i) {
    var p = this.people[i], rect = this.el.getBoundingClientRect();
    this.tip.innerHTML = '<strong>Person #' + p.id + '</strong>Pattern 1 ' + (p.z[0] >= 0 ? '+' : '−') + Math.abs(p.z[0]).toFixed(1) +
      ' · pattern 2 ' + (p.z[1] >= 0 ? '+' : '−') + Math.abs(p.z[1]).toFixed(1) +
      '<br>Day changed more than ' + Math.round(p.energy_pct) + '% of the cohort<br><em>Select to load</em>';
    this.tip.hidden = false;
    var left = ev.clientX - rect.left + 12, tw = this.tip.offsetWidth;
    if (left + tw > this.el.clientWidth) left = ev.clientX - rect.left - tw - 12;
    this.tip.style.left = Math.max(0, left) + 'px';
    this.tip.style.top = Math.max(0, ev.clientY - rect.top - 60) + 'px';
  };
  Scatter.prototype.select = function (i) { this.selected = i; this.render(); };

  root.RTD.charts = { DayChart: DayChart, Scatter: Scatter, fmtPct: fmtPct, timingText: timingText, amountText: amountText };
})(typeof self !== 'undefined' ? self : this);
