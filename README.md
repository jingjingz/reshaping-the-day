# Reshaping the Day

A visual, interactive guide to how daily physical activity changes over the years, in amount and in timing. It demonstrates the Riemannian deformation approach to longitudinal accelerometer data (Zou et al., 2023) and its application to older women in the OPACH and WHISH studies (Zablocki et al., 2026).

- **Story** (`index.html`): three ideas in order. Change has two parts, timing and amount. Cohorts share a few patterns of change. Those patterns relate to physical function.
- **Explorer** (`explorer.html`): mix the four common patterns and watch a typical day change, compare people who lose the same daily total in different ways, and browse a synthetic cohort.

## Data

Every curve on the site is synthetic. Shapes are traced from the published figures of the arXiv preprint. No study participant's data are in this repository, and `data/` holds synthetic files only.

## How it works

A day is a smooth curve of activity from 6 am to midnight. A change between two visits is a deformation of that curve driven by initial momenta at each time point: the sideways part moves activity earlier or later, the vertical part changes how much there is. `assets/js/engine.js` computes the deformation in the browser (geodesic shooting with a Gaussian kernel, RK2 integration), mirroring `tools/make_synthetic.py`.

## Run locally

```sh
python3 -m http.server 8000      # then open http://localhost:8000
```

## Regenerate the synthetic data and test the engine

```sh
pip install numpy scipy
python3 tools/make_synthetic.py  # writes data/synthetic.json and the engine fixture
node tools/test_engine.js        # checks the browser engine against the Python reference
```

## Papers

- Zablocki RW, Nguyen S, Wang Y, et al. Modeling physical activity change as smooth transformations: temporal and amplitude patterns associated with physical function in older women. arXiv:2604.22123, 2026. https://arxiv.org/abs/2604.22123
- Zou J, Lin T, Di C, et al. A Riemann manifold model framework for longitudinal changes in physical activity patterns. Annals of Applied Statistics 17(4):3216–3240, 2023. https://doi.org/10.1214/23-AOAS1758
- Method code: https://github.com/jingjingz/PA_change
