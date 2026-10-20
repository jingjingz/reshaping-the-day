// Write two synthetic sample files for the "Try your own data" page.
// Usage: node tools/make_samples.js
const fs = require('fs'), path = require('path');
const P = require('../assets/js/preprocess.js');
const D = require('../data/synthetic.json');
const toCounts = g => P.fromGrid(Array.from(g, v => D.meta.grand_mean + D.meta.four_sd * v));
const dir = path.join(__dirname, '..', 'data', 'sample');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'visit1.csv'), P.sampleCSV(toCounts(D.hero.base), 7, 101, '2023-04-03'));
fs.writeFileSync(path.join(dir, 'visit2.csv'), P.sampleCSV(toCounts(D.hero.target), 7, 202, '2026-04-06'));
console.log('wrote', fs.readdirSync(dir).map(f => f + ' ' + fs.statSync(path.join(dir, f)).size + ' bytes').join(', '));
