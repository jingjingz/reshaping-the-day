"""Generate the synthetic data behind Reshaping the Day.

Everything this script writes is synthetic. Shapes are traced from the figures
of Zablocki et al. (arXiv:2604.22123): the typical day (Fig 3c), the mean
initial momenta (Fig 3a-b) and patterns 1-4 (Fig 4, 7, 8, 9). No participant
data are read or written.

Model: each activity day is a curve of control points q_j = (scaled time,
scaled activity). A change between visits is a geodesic deformation driven by
initial momenta p_j (LDDMM with a Gaussian kernel), integrated with RK2 midpoint
steps. assets/js/engine.js implements the same integrator for the browser.

Usage:  python3 tools/make_synthetic.py
Writes: data/synthetic.json and tools/fixtures/shoot_reference.json
"""
import json
import os

import numpy as np
from scipy.interpolate import PchipInterpolator

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rng = np.random.default_rng(20261019)

# ------------------------------------------------------------------ grid
STEP = 5                                    # minutes between control points
MINUTES = np.arange(0, 1080 + STEP, STEP)   # 6:00 .. 24:00
HOURS = 6 + MINUTES / 60.0
S = -1 + 2 * MINUTES / 1080.0               # scaled time in [-1, 1]
N = len(S)
# Kernel: sum of two Gaussians, sizes from fmatch_subj_local.m in github.com/jingjingz/PA_change,
# in the convention exp(-|x - y|^2 / (2 sigma^2)) stated in Zou et al. (2023)
SIGMAS = [0.08, 0.02]
NSTEPS = 10                                 # nb_euler_steps in the same script
GRAND_MEAN, FOUR_SD = 320.0, 1000.0         # illustrative counts per minute

DECIMALS = 7


def field(anchors):
    h, v = zip(*anchors)
    return PchipInterpolator(h, v)(HOURS)


def bump(center, width, height=1.0):
    return height * np.exp(-0.5 * ((HOURS - center) / width) ** 2)


# ------------------------------------------------------------------ shapes traced from the paper
TYPICAL = field([(6, -0.20), (6.5, -0.07), (7, 0.03), (8, 0.12), (9, 0.165), (10, 0.18),
                 (11, 0.168), (12, 0.145), (13, 0.128), (14, 0.108), (15, 0.093), (16, 0.082),
                 (17, 0.072), (17.5, 0.076), (18, 0.062), (19, 0.02), (20, -0.035),
                 (21, -0.08), (22, -0.12), (23, -0.17), (24, -0.25)])

RAW = {
    "mean": (
        [(6, 5.5), (7, 3.0), (8, 2.0), (9, 1.2), (10, 0.3), (10.33, 0), (11, -0.6), (12, -1.3),
         (13, -0.9), (14.5, -0.4), (16, -0.8), (18, -1.3), (19.5, -1.6), (20.5, -1.7),
         (21.5, -1.0), (22.5, -0.5), (23.3, -1.2), (24, -2.4)],
        [(6, -1.8), (7, -2.3), (8, -2.4), (9, -2.45), (10, -2.5), (11, -2.4), (12, -2.0),
         (13, -1.7), (14, -1.75), (15, -1.8), (16.5, -1.7), (17.5, -1.6), (18.5, -2.1),
         (19.9, -2.9), (21, -1.8), (22, -0.8), (23, -0.4), (24, -0.4)]),
    "p1": (
        [(6, -3), (7, -6), (8, -7), (9, -4), (10, 0), (11, 3), (12, 4), (13, 4), (14, 3.7),
         (15, 3.7), (16, 4), (18, 6), (20, 8), (21, 8.2), (22, 6), (23, 3), (24, 0)],
        [(6, -3), (7, 15), (8, 30), (9, 40), (10, 44), (11, 42), (12, 39), (13, 38.5),
         (14, 36), (15, 34), (16, 33), (17, 33), (18, 30), (19, 22), (20, 16), (21, 13),
         (22, 11), (23, 6), (24, 0)]),
    "p2": (
        [(6, -10), (7, -40), (8, -55), (9, -40), (10, -15), (11, -3), (12, -3), (13, -3),
         (15, 1), (17, 1), (19, 2), (21, 4), (22, 1), (23, 0), (24, 0)],
        [(6, 0), (7, 40), (8, 60), (9, 45), (10, 10), (11, -15), (12, -18), (13, -17),
         (14, -20), (15, -25), (16, -20), (17, -10), (18, 0), (19, 8), (19.8, 10), (21, 3),
         (22, -4), (23, -6), (24, -7)]),
    "p3": (
        [(6, 0), (7, -12), (8, -20), (9, -12), (10, -4), (11, -3), (12, -2), (13, 2), (14, 5),
         (15, 8), (16, 7), (17, 6), (18, 7), (19, 8), (20, 8), (21, 5), (22, 1), (23, 1), (24, 3)],
        [(6, 0), (6.8, 10), (7.5, 13), (8.5, 0), (9.5, -40), (10.4, -68), (11.2, -45),
         (12.5, -10), (13.5, 0), (14.5, 8), (15.5, 22), (16.5, 36), (17.5, 40), (18.5, 32),
         (19.5, 18), (20.5, 10), (22, 7), (24, 6)]),
    "p4": (
        [(6, 8), (7.5, 10), (9, 11), (10.5, 8), (12, 3), (13, 0), (14.5, -4), (16, -7),
         (17, -4), (18.5, 2), (20, 8), (21, 11), (22, 10), (23, 6), (24, 0)],
        [(6, 28), (7, 0), (8, -25), (9, 5), (10, 40), (11, 25), (12, -20), (13, -50),
         (13.7, -60), (14.5, -40), (15.5, 0), (16.5, 30), (18, 40), (19, 30), (20, 18),
         (21, 15), (22, 12), (24, 8)]),
}
FIELDS = {k: np.stack([field(x), field(y)], axis=1) for k, (x, y) in RAW.items()}

# Share of variation explained, baseline to W1 (preprint values; provisional)
PVE = {"p1": 22.4, "p2": 10.9, "p3": 9.1, "p4": 6.9}


# ------------------------------------------------------------------ geodesic shooting
def _rhs(q, p):
    d = q[:, None, :] - q[None, :, :]
    r2 = (d ** 2).sum(-1)
    K = sum(np.exp(-r2 / (2 * s ** 2)) for s in SIGMAS)
    Kd = sum(np.exp(-r2 / (2 * s ** 2)) / s ** 2 for s in SIGMAS)
    dq = K @ p
    dp = ((Kd * (p @ p.T))[:, :, None] * d).sum(1)
    return dq, dp


def shoot(curve, p0):
    q = np.stack([S, curve], axis=1)
    p = p0.copy()
    h = 1.0 / NSTEPS
    for _ in range(NSTEPS):
        k1q, k1p = _rhs(q, p)
        k2q, k2p = _rhs(q + 0.5 * h * k1q, p + 0.5 * h * k1p)
        q, p = q + h * k2q, p + h * k2p
    return q


def resample(q1):
    order = np.argsort(q1[:, 0])
    return np.interp(S, q1[order, 0], q1[order, 1])


def daily_total(curve):
    return float(np.sum(GRAND_MEAN + FOUR_SD * curve) * STEP)


def pct_change(c0, c1):
    return 100 * (daily_total(c1) - daily_total(c0)) / daily_total(c0)


def bisect(fn, target, lo, hi, increasing=True, iters=40):
    """Find x in [lo, hi] with fn(x) = target for a monotone fn."""
    for _ in range(iters):
        mid = 0.5 * (lo + hi)
        below = fn(mid) < target
        lo, hi = (mid, hi) if below == increasing else (lo, mid)
    return 0.5 * (lo + hi)


def max_disp(curve, p):
    q1 = shoot(curve, p)
    return float(np.max(np.hypot(q1[:, 0] - S, q1[:, 1] - curve)))


def unit(F):
    return F / np.abs(F).max()


# One-SD patterns: largest displacement of the typical day proportional to sqrt(PVE)
TARGET = {"mean": 0.05}
TARGET.update({k: 0.07 * np.sqrt(v / PVE["p1"]) for k, v in PVE.items()})
M = {}
for k in ["mean", "p1", "p2", "p3", "p4"]:
    u = unit(FIELDS[k])
    c = bisect(lambda c: max_disp(TYPICAL, c * u), TARGET[k], 0.0, 0.05)
    M[k] = c * u

# ------------------------------------------------------------------ archetypes: same daily total, different day
SHIFT_B = 60 / 540.0                       # the late riser starts about an hour later
late_field = unit(np.stack([bump(8.0, 1.2), -0.35 * bump(12.0, 1.5)], axis=1))
B_base = TYPICAL + bump(8.3, 0.6, 0.04)
cB = bisect(lambda c: float(np.max(shoot(B_base, c * late_field)[:, 0] - S)), SHIFT_B, 0.0, 0.05)
pB = cB * late_field
TARGET_PCT = pct_change(B_base, resample(shoot(B_base, pB)))


def match_total(base, F):
    u = unit(F)
    c = bisect(lambda c: pct_change(base, resample(shoot(base, c * u))), TARGET_PCT, 0.0, 0.05,
               increasing=False)
    return c * u


A_base = TYPICAL + bump(18.8, 0.7, 0.07)
pA = match_total(A_base, np.stack([0 * HOURS, -bump(19.0, 1.4)], axis=1))
p_even = match_total(TYPICAL, -M["p1"])
p_slump = match_total(TYPICAL, np.stack([0 * HOURS, -bump(13.5, 1.6)], axis=1))
# later start (pushed right in the morning), earlier wind-down (pushed left in the evening)
p_short = match_total(TYPICAL, np.stack([bump(7.5, 1.3) - bump(21.0, 1.5), -0.15 * bump(21.0, 1.5)], axis=1))

ARCHETYPES = [
    ("evening-fade", "Evening fade", "The early-evening walk fades.", A_base, pA),
    ("late-riser", "Late riser", "Mornings start about an hour later.", B_base, pB),
    ("even-decline", "Even decline", "A little less activity at every hour.", TYPICAL, p_even),
    ("midday-slump", "Midday slump", "Early afternoon goes quiet.", TYPICAL, p_slump),
    ("shorter-day", "Shorter day", "Starts later and winds down earlier.", TYPICAL, p_short),
]

_shift_h = 1.0 * np.exp(-0.5 * ((HOURS - 8.0) / 1.2) ** 2)
PURE_SHIFT_TARGET = np.interp(np.clip(HOURS - _shift_h, 6, 24), HOURS, B_base)

hero_base = TYPICAL + bump(18.5, 0.6, 0.09) + bump(12.6, 0.4, 0.03) - bump(6.6, 0.5, 0.05)
hero_p = pA + pB

# ------------------------------------------------------------------ synthetic cohort (scores only)
def energy(p):
    return float((p ** 2).sum())


cohort = []
for i in range(300):
    z = rng.standard_normal(4)
    p = M["mean"] + sum(z[j] * M[f"p{j + 1}"] for j in range(4))
    cohort.append({"id": i + 1, "z": [round(float(v), 3) for v in z], "energy": energy(p)})
E = np.array([c["energy"] for c in cohort])
for c in cohort:
    c["energy_pct"] = round(float((E < c["energy"]).mean() * 100), 1)
    c["energy"] = round(c["energy"] * 1e6, 4)   # stored ×1e6 for readability


# ------------------------------------------------------------------ write
def r(a):
    return [round(float(v), DECIMALS) for v in np.asarray(a).ravel()]


def mom(p):
    return {"x": r(p[:, 0]), "y": r(p[:, 1])}


out = {
    "meta": {
        "note": "Synthetic. Shapes traced from Zablocki et al., arXiv:2604.22123. No participant data.",
        "step_minutes": STEP, "n": N, "sigmas": SIGMAS, "nsteps": NSTEPS,
        "grand_mean": GRAND_MEAN, "four_sd": FOUR_SD, "energy_scale": 1e6,
        "pve_note": "Share of variation from the preprint (baseline to W1). Provisional.",
    },
    "typical": r(TYPICAL),
    "patterns": {k: mom(M[k]) for k in ["mean", "p1", "p2", "p3", "p4"]},
    "pve": PVE,
    "hero": {"base": r(hero_base), "target": r(resample(shoot(hero_base, hero_p)))},
    "archetypes": [{"id": a, "name": nm, "blurb": bl, "base": r(b), "target": r(resample(shoot(b, p)))}
                   for a, nm, bl, b, p in ARCHETYPES],
    "examples": {"pure_shift": {"base": r(B_base), "target": r(PURE_SHIFT_TARGET)}},
    "cohort": cohort,
}
os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
with open(os.path.join(ROOT, "data", "synthetic.json"), "w") as fh:
    json.dump(out, fh, separators=(",", ":"))

# Reference shoot for the JS engine test, computed from the rounded inputs it will read
fx_base = np.array(out["typical"])
fx_p = np.stack([out["patterns"]["p1"]["x"], out["patterns"]["p1"]["y"]], axis=1)
q1 = shoot(fx_base, fx_p)
os.makedirs(os.path.join(ROOT, "tools", "fixtures"), exist_ok=True)
with open(os.path.join(ROOT, "tools", "fixtures", "shoot_reference.json"), "w") as fh:
    json.dump({"q1x": q1[:, 0].tolist(), "q1y": q1[:, 1].tolist()}, fh)

print("archetype totals (%):", [round(pct_change(b, resample(shoot(b, p))), 2) for _, _, _, b, p in ARCHETYPES])
print("hero total (%):", round(pct_change(hero_base, resample(shoot(hero_base, hero_p))), 2))
print("data/synthetic.json bytes:", os.path.getsize(os.path.join(ROOT, "data", "synthetic.json")))
