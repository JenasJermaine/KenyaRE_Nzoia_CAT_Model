# Nzoia Basin Flood Challenge — Team B

A riverine flood catastrophe model for a synthetic property portfolio in the Lower Nzoia basin
(Budalangi, Kenya), with an ML vulnerability model and a Next.js app that explains it.

| Folder | What it is |
| --- | --- |
| `team_b_nzoia/` | Starter kit: JRC flood depth rasters (10–500 yr) and the synthetic portfolio |
| `notebooks/nzoia_flood_cat_model.ipynb` | End-to-end model: exposure audit, hazard, ML vulnerability training, financial engine, EP curves, Monte Carlo, accumulation, assumption register. `_build_notebook.py` generates it |
| `outputs/` | Figures, pseudo-claims, year-loss table, assumption register, per-building results |
| `web/` | Next.js app (see `web/README.md`) |

## Quick start

```bash
pip install numpy pandas rasterio scipy scikit-learn matplotlib jupyter
cd notebooks
python -m jupyter nbconvert --to notebook --execute --inplace nzoia_flood_cat_model.ipynb

cd ../web
npm install
npm run dev     # http://localhost:3000
```

## Data QA note

`tiv_kes` in `portfolio_synthetic.csv` is 10× the value documented in the data dictionary
(KES 22.7 bn vs. 2.27 bn). The documented value equals floor area × cost per m², rounded to
KES 5,000, so the model uses that value and keeps the file value as `tiv_kes_file`.
