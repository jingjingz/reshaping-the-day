// Checks that the browser engine reproduces the Python reference shoot.
// Usage: node tools/test_engine.js
const assert = require('assert');
const path = require('path');
const engine = require('../assets/js/engine.js');
const data = require('../data/synthetic.json');
const ref = require('./fixtures/shoot_reference.json');

const t0 = Date.now();
const res = engine.shoot(data.hero.base, data.hero.p.x, data.hero.p.y,
  { sigma: data.meta.sigma, nsteps: data.meta.nsteps });
const ms = Date.now() - t0;

let maxErr = 0;
for (let j = 0; j < res.qx.length; j++) {
  maxErr = Math.max(maxErr, Math.abs(res.qx[j] - ref.q1x[j]), Math.abs(res.qy[j] - ref.q1y[j]));
}
assert.ok(maxErr < 1e-10, `engine differs from Python reference by ${maxErr}`);

// Every archetype should lose the same share of daily activity
const totals = data.archetypes.map(a => engine.pctChange(a.base,
  engine.shoot(a.base, a.p.x, a.p.y, { sigma: data.meta.sigma, nsteps: data.meta.nsteps }), data.meta));
totals.forEach(t => assert.ok(Math.abs(t - totals[0]) < 0.05, `archetype totals differ: ${totals}`));

console.log(`ok: max abs difference ${maxErr.toExponential(2)}, one shoot ${ms} ms, ` +
  `archetype totals ${totals.map(t => t.toFixed(2)).join(', ')} %`);
