"""
Global SHAP explanation of the ML vulnerability model, exported for the web dashboard.

We explain the model exactly as deployed: the lookup table in web/public/data/vulnerability.json that both the
notebook's financial engine and the browser engine read (mean head, interpolated in depth and quality, and in
ln(duration) between the 2/7/21-day planes). Shapley values are computed with shap's ExactExplainer (4 features, so
every coalition is evaluated - no sampling approximation) against a background of pseudo-claims.

Run after the notebook:   python notebooks/explain_shap.py
Writes:                   web/public/data/explain.json
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
import shap

ROOT = Path(__file__).resolve().parent.parent
VULN = json.loads((ROOT / "web/public/data/vulnerability.json").read_text(encoding="utf-8"))
CLAIMS = pd.read_csv(ROOT / "outputs/pseudo_claims_synthetic.csv")
OUT = ROOT / "web/public/data/explain.json"

SEED = 2026
CLASSES = VULN["classes"]
DEPTH_STEP, DEPTH_MAX = VULN["depthStep"], VULN["depthMax"]
LN_DUR = np.log(np.array(VULN["durationGrid"], float))
FEATURES = [
    ("cls", "Construction class"),
    ("depth", "Flood depth (m)"),
    ("duration", "Flood duration (days)"),
    ("quality", "Build quality (0-1)"),
]
# ML[class][duration, quality, depth] for the mean head
ML = {c: np.array(VULN["ml"][c]["mean"], float) for c in CLASSES}


def lookup(cls_code, depth, duration, quality):
    """Vectorised port of engine.ts damageRatio (mean head), extended to continuous duration."""
    cls_code = cls_code.astype(int)
    d = np.clip(depth, 0, DEPTH_MAX)
    x = d / DEPTH_STEP
    n = int(round(DEPTH_MAX / DEPTH_STEP)) + 1
    i0 = np.minimum(np.floor(x).astype(int), n - 2)
    w = x - i0
    qx = np.clip(quality, 0, 1) * 2
    q0 = np.minimum(np.floor(qx).astype(int), 1)
    wq = qx - q0
    lt = np.clip(np.log(np.clip(duration, 1e-6, None)), LN_DUR[0], LN_DUR[-1])
    t0 = np.minimum(np.searchsorted(LN_DUR, lt, side="right") - 1, len(LN_DUR) - 2)
    wt = (lt - LN_DUR[t0]) / (LN_DUR[t0 + 1] - LN_DUR[t0])
    out = np.zeros(len(depth))
    for k, c in enumerate(CLASSES):
        m = cls_code == k
        if not m.any():
            continue
        M = ML[c]

        def plane(t):
            lo = M[t, q0[m], i0[m]] * (1 - w[m]) + M[t, q0[m], i0[m] + 1] * w[m]
            hi = M[t, q0[m] + 1, i0[m]] * (1 - w[m]) + M[t, q0[m] + 1, i0[m] + 1] * w[m]
            return lo * (1 - wq[m]) + hi * wq[m]

        out[m] = plane(t0[m]) * (1 - wt[m]) + plane(t0[m] + 1) * wt[m]
    return np.where(depth > 0, out, 0.0)


def f(X):
    X = np.asarray(X, float)
    return lookup(X[:, 0], X[:, 1], X[:, 2], X[:, 3])


claims = CLAIMS.assign(cls=CLAIMS.housing_class.map({c: i for i, c in enumerate(CLASSES)}))
X_all = claims[["cls", "depth_m", "duration_days", "quality"]].to_numpy(float)
rng = np.random.default_rng(SEED)
background = X_all[rng.choice(len(X_all), 200, replace=False)]
wet = X_all[X_all[:, 1] > 0.05]
explain_rows = wet[rng.choice(len(wet), 1500, replace=False)]

explainer = shap.ExactExplainer(f, shap.maskers.Independent(background, max_samples=len(background)))
sv = explainer(explain_rows)
values, base = sv.values, float(np.mean(sv.base_values))
additivity_err = float(np.max(np.abs(values.sum(1) + sv.base_values - f(explain_rows))))
assert additivity_err < 1e-6, additivity_err

mean_abs = np.abs(values).mean(0)
order = np.argsort(-mean_abs)
lo, hi = explain_rows.min(0), explain_rows.max(0)
norm = (explain_rows - lo) / np.where(hi > lo, hi - lo, 1)

sample = rng.choice(len(explain_rows), 400, replace=False)
beeswarm = [
    dict(f=FEATURES[j][0], shap=round(float(values[i, j]), 4), v=round(float(norm[i, j]), 3), raw=round(float(explain_rows[i, j]), 3))
    for i in sample for j in range(len(FEATURES))
]
dep = rng.choice(len(explain_rows), 600, replace=False)
depth_dependence = [
    dict(depth=round(float(explain_rows[i, 1]), 3), shap=round(float(values[i, 1]), 4), cls=CLASSES[int(explain_rows[i, 0])])
    for i in dep
]
by_class = {
    c: {FEATURES[j][0]: round(float(np.abs(values[explain_rows[:, 0] == k, j]).mean()), 4) for j in range(len(FEATURES))}
    for k, c in enumerate(CLASSES)
}

result = dict(
    method="SHAP (shap.ExactExplainer, interventional, all 16 feature coalitions evaluated)",
    library=f"shap {shap.__version__}",
    model="ML vulnerability model - mean damage-ratio head, as exported to vulnerability.json",
    background=dict(n=len(background), source="pseudo-claims (synthetic)"),
    explained=dict(n=len(explain_rows), filter="pseudo-claims with depth > 0.05 m"),
    baseValue=round(base, 4),
    additivityMaxError=additivity_err,
    features=[dict(key=FEATURES[j][0], label=FEATURES[j][1], meanAbsShap=round(float(mean_abs[j]), 4)) for j in order],
    byClass=by_class,
    beeswarm=beeswarm,
    depthDependence=depth_dependence,
)
OUT.write_text(json.dumps(result, separators=(",", ":")), encoding="utf-8")
print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.0f} KB)")
for j in order:
    print(f"  {FEATURES[j][1]:<24} mean |SHAP| = {mean_abs[j]:.4f}")
print(f"  base value E[f(background)] = {base:.4f}; additivity max error = {additivity_err:.2e}")
