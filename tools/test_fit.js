// Checks the fitting used for the illustrated people and for uploads.
// Usage: node tools/test_fit.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const E = require('../assets/js/engine.js');
const P = require('../assets/js/preprocess.js');
const F = require('../assets/js/fit.js');
const D = require('../data/synthetic.json');
const meta = D.meta, opt = { sigmas: meta.sigmas, nsteps: meta.nsteps };

// 1) the stored fitted pushes reproduce each visit-2 curve and its daily total
const people = [['hero', D.hero], ...D.archetypes.map(a => [a.id, a]), ['pure_shift', D.examples.pure_shift]];
people.forEach(([name, o]) => {
  const res = E.shoot(o.base, o.p.x, o.p.y, opt), after = E.resample(res.qx, res.qy);
  let se = 0, t1 = 0, t2 = 0;
  for (let j = 0; j < after.length; j++) { se += (after[j] - o.target[j]) ** 2; t1 += o.target[j]; t2 += after[j]; }
  const rmse = Math.sqrt(se / after.length);
  assert.ok(rmse < 0.006, `${name}: stored pushes miss visit 2 (rmse ${rmse})`);
  console.log(`${name.padEnd(14)} rmse ${rmse.toFixed(4)}`);
});

// 2) a pure one-hour morning shift is read mostly as a later morning
const ps = D.examples.pure_shift, sPS = E.summarize(ps.base, E.shoot(ps.base, ps.p.x, ps.p.y, opt), meta, 45);
assert.ok(sPS.maxShift > 25 && sPS.maxShift < 70, `pure shift recovered as ${sPS.maxShift} min`);
console.log(`pure shift     largest timing shift ${sPS.maxShift.toFixed(0)} min at ${E.clock(sPS.maxShiftAt)}`);

// 3) upload pipeline on the sample files: parse, average, smooth, estimate noise, fit
const t0 = Date.now();
const vis = ['visit1', 'visit2'].map(f => P.averageDay(P.parseCounts(fs.readFileSync(path.join(__dirname, '..', 'data', 'sample', f + '.csv'), 'utf8')).days));
const g = vis.map(v => Array.from(P.toGrid(P.whittaker(v.curve, 25)), x => (x - meta.grand_mean) / meta.four_sd));
const ms = vis.map(v => { const a = P.toGrid(v.se); return a.reduce((s, x) => s + x * x, 0) / a.length; });
const noise = Math.max(0.01, Math.sqrt(ms[0] + ms[1]) / meta.four_sd);
const fit = F.fitDeformation(g[0], g[1], Object.assign({ gamma: 1000, noise, maxIter: 60 }, opt));
const s = E.summarize(g[0], fit.result, meta, 45);
const ref = E.summarize(D.hero.base, E.shoot(D.hero.base, D.hero.p.x, D.hero.p.y, opt), meta, 45);
console.log(`sample upload  valid days ${vis[0].nValid}/${vis[1].nValid}  noise ${noise.toFixed(3)}  ` +
  `largest shift ${s.maxShift.toFixed(0)} min at ${E.clock(s.maxShiftAt)} (clean fit ${ref.maxShift.toFixed(0)} at ${E.clock(ref.maxShiftAt)})  ${Date.now() - t0} ms`);
assert.ok(vis[0].nValid === 7 && vis[1].nValid === 7, 'all sample days should be valid');
assert.ok(s.maxShift > 0 && s.maxShiftAt < 10 * 60, 'sample: the largest shift should be a later morning');
console.log('ok');
