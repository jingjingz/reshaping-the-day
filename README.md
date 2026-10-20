# Reshaping the Day

A visual, interactive guide to how daily physical activity changes over the years, in amount and in timing. It demonstrates the Riemannian deformation approach to longitudinal accelerometer data (Zou et al., 2023) and its application to older women in the OPACH and WHISH studies (Zablocki et al., 2026).

- **Story** (`index.html`): three ideas in order. Change has two parts, timing and amount. Cohorts share a few patterns of change. Those patterns relate to physical function.
- **How it works** (`method.html`): the five steps from wear data to outcomes, in plain terms, with notes on applying the method to another study.
- **Explorer** (`explorer.html`): mix the four common patterns and watch a typical day change, compare people who lose the same daily total in different ways, and browse a synthetic cohort.
- **Your data** (`yourdata.html`): upload two visits of minute-level counts for one person. The page averages and smooths each visit, estimates day-to-day noise, fits the pushes between visits and projects them on the four patterns. Files never leave the browser.

## Data

Every curve on the site is synthetic. Shapes are traced from the published figures of the arXiv preprint. No study participant's data are in this repository, and `data/` holds synthetic files only.

## How it works

A day is a smooth curve of activity from 6 am to midnight. A change between two visits is a deformation of that curve driven by initial momenta at each time point: the sideways part moves activity earlier or later, the vertical part changes how much there is.

- `assets/js/engine.js` shoots a deformation in the browser: geodesic shooting with a kernel that sums two Gaussians (sizes 0.08 and 0.02, 10 steps, the settings in `fmatch_subj_local.m` of PA_change), RK2 integration. It mirrors `tools/make_synthetic.py`.
- `assets/js/fit.js` fits the momenta between two curves: least squares on the curve plus an energy penalty, Levenberg-Marquardt over smooth hourly bumps. It approximates the fshapesTK fit used in the papers.
- `assets/js/preprocess.js` turns minute-level CSV files into a smoothed average day (6 am to midnight, days with 14 or more hours of wear, a Whittaker smoother with 25 degrees of freedom).

Every push shown on the site is fitted from the two curves, the way the method estimates it. Fits can read part of a timing shift as a change in amount where the day's curve is shallow; `method.html` explains this.

## Run locally

```sh
python3 -m http.server 8000      # then open http://localhost:8000
```

## Regenerate the synthetic data and test the engine

```sh
pip install numpy scipy
python3 tools/make_synthetic.py  # synthetic cohort, patterns and visit-2 curves; engine fixture
node tools/fit_synthetic.js      # fits the pushes for every illustrated person
node tools/make_samples.js       # sample upload files in data/sample/
node tools/test_engine.js        # browser engine against the Python reference
node tools/test_fit.js           # stored fits, a pure one-hour shift, the upload pipeline
```

## Papers

- Zablocki RW, Nguyen S, Wang Y, et al. Modeling physical activity change as smooth transformations: temporal and amplitude patterns associated with physical function in older women. arXiv:2604.22123, 2026. https://arxiv.org/abs/2604.22123
- Zou J, Lin T, Di C, et al. A Riemann manifold model framework for longitudinal changes in physical activity patterns. Annals of Applied Statistics 17(4):3216–3240, 2023. https://doi.org/10.1214/23-AOAS1758
- Method code: https://github.com/jingjingz/PA_change
