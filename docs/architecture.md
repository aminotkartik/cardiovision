# Architecture and deployment notes

## Request path

```text
Browser (Next.js / React)
  └─ relative /backend/* requests
      └─ Next rewrite (BACKEND_URL; server-to-server)
          └─ FastAPI / Pydantic
              ├─ schema.json (generated from local data audit)
              ├─ fitted scikit-learn pipelines (one per target)
              └─ metrics.json / model_metadata.json / leakage_audit.json
```

The browser never calls `localhost` to reach the backend. Locally, Next.js proxies same-origin `/backend/*` to the API. In deployment, configure `BACKEND_URL` on the frontend host. `NEXT_PUBLIC_API_BASE_URL` is optional for a deliberately direct browser-to-API deployment and requires matching CORS configuration.

## Boundaries

- `backend/training/` is offline-only dataset audit and model fitting.
- `backend/app/ml/inference.py` loads trusted local artifacts once at process startup; API requests never retrain.
- `backend/app/schemas/` describes public HTTP contracts, separate from estimator internals.
- `frontend/lib/` owns API requests, validation, score mapping and report shaping.
- `frontend/components/anatomy/HeartScene.jsx` builds the original low-poly procedural heart/vessels at runtime; no remote model download is required.

## Development

Run API from `backend/` with `uvicorn app.main:app --host 0.0.0.0 --port 8000`. Run the website from `frontend/` with `npm run dev`. The API's health endpoint reports a degraded state until all four model files are loaded. An audited schema can be used to construct the form and a clearly synthetic profile even before training; prediction remains unavailable until all four fitted artifacts exist.

## Deployment

- **Frontend:** deploy `frontend/` as a Next.js app (for example, Vercel). Set build root to `frontend`; set `BACKEND_URL` to the reachable HTTPS FastAPI origin. Keep the relative `/backend` API path for same-origin proxying. If the frontend is served directly against the backend, set `NEXT_PUBLIC_API_BASE_URL` and explicitly allow the frontend origin in backend `CORS_ORIGINS`.
- **Backend:** use a Python 3.11+ container/PaaS. `backend/Dockerfile` serves `0.0.0.0:8000`. Mount a persistent or release-built artifact directory at `CARDIOVISION_ARTIFACT_DIR`; artifacts are not committed. Configure TLS at the host and allow only the intended frontend origin.
- Train in a controlled environment using the licensed local table, retain the JSON audit/metrics and trusted joblib files together, and restart the API after replacing artifacts. Treat model artifacts as executable pickle content: load only files produced by a trusted training run.

## Privacy and operations

The browser holds inputs only in session state. No third-party analytics, inference provider, hosted explanation service, remote font or image endpoint is used. API logs contain request status and prediction IDs, not submitted feature values. Reports are generated locally by the browser; users should still avoid entering direct identifiers. Add authentication, encrypted storage, retention controls and formal security review before any deployment that could receive real clinical data.
