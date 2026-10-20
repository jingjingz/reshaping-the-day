// Fit the deformation for every illustrated person, so the site shows the
// pushes the method estimates (not the pushes used to generate the change).
// Usage: node tools/fit_synthetic.js   (run after tools/make_synthetic.py)
const fs = require('fs');
const path = require('path');
const E = require('../assets/js/engine.js');
const F = require('../assets/js/fit.js');

const file = path.join(__dirname, '..', 'data', 'synthetic.json');
const D = JSON.parse(fs.readFileSync(file, 'utf8'));
const opt = { sigmas: D.meta.sigmas, nsteps: D.meta.nsteps, gamma: D.meta.fit_gamma || 200, maxIter: 60 };
D.meta.fit_gamma = opt.gamma;
D.meta.fit_note = 'Displayed pushes are fitted by assets/js/fit.js from each visit-2 curve.';

const r7 = a => Array.from(a, v => Math.round(v * 1e7) / 1e7);
function fitOne(name, obj) {
  const t0 = Date.now();
  const f = F.fitDeformation(obj.base, obj.target, opt);
  obj.p = { x: r7(f.p.x), y: r7(f.p.y) };
  obj.fit_rmse = Math.round(f.rmse * 1e5) / 1e5;
  const s = E.summarize(obj.base, f.result, D.meta);
  console.log(`${name.padEnd(14)} rmse ${f.rmse.toFixed(4)}  total ${s.total.toFixed(2)}%  ` +
    `largest shift ${s.maxShift.toFixed(0)} min at ${E.clock(s.maxShiftAt)}  ${Date.now() - t0} ms`);
}
fitOne('hero', D.hero);
D.archetypes.forEach(a => fitOne(a.id, a));
fitOne('pure_shift', D.examples.pure_shift);
fs.writeFileSync(file, JSON.stringify(D));
console.log('wrote', file, fs.statSync(file).size, 'bytes');
