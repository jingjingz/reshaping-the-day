/* Runs the deformation fit off the main thread so the page stays responsive. */
importScripts('engine.js', 'fit.js');

self.onmessage = function (e) {
  var m = e.data;
  try {
    var opts = Object.assign({}, m.opts, {
      onProgress: function (it) { self.postMessage({ type: 'progress', it: it, max: m.opts.maxIter || 30 }); }
    });
    var res = self.RTD.fit.fitDeformation(m.base, m.target, opts);
    self.postMessage({ type: 'done', p: { x: Array.from(res.p.x), y: Array.from(res.p.y) }, rmse: res.rmse, iterations: res.iterations });
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message });
  }
};
