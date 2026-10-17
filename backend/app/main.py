"""CardioVision FastAPI service. Artifacts load once at process start."""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .ml.inference import ArtifactStore
from .schemas.api import (
    DemoPatientResponse,
    ExplainRequest,
    ExplanationResponse,
    HealthResponse,
    ModelMetricsResponse,
    PredictionRequest,
    PredictionResponse,
    SchemaResponse,
)

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
LOGGER = logging.getLogger("cardiovision.api")


def make_store() -> ArtifactStore:
    configured = os.getenv("CARDIOVISION_ARTIFACT_DIR")
    if configured:
        return ArtifactStore(configured)
    return ArtifactStore(Path(__file__).resolve().parents[1] / "artifacts")


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.artifacts = make_store()
    health = app.state.artifacts.health()
    LOGGER.info(
        "API startup: inference_available=%s loaded_model_count=%s schema_available=%s",
        health["inference_available"], health["loaded_model_count"], health["schema_available"],
    )
    yield


app = FastAPI(
    title="CardioVision 3D API",
    version="0.1.0",
    description=(
        "Educational/research prototype for CAD and vessel classifier outputs. "
        "Not validated for clinical decision-making."
    ),
    lifespan=lifespan,
)

origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=os.getenv("CORS_ORIGIN_REGEX", r"^https://.*\.(e2b\.app|vercel\.app)$"),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


def store_from(request: Request) -> ArtifactStore:
    store = getattr(request.app.state, "artifacts", None)
    if store is None:
        # Useful for ASGI transports that do not manage lifespan; this remains a real store,
        # not a demo model or in-memory prediction substitute.
        store = make_store()
        request.app.state.artifacts = store
    return store


@app.exception_handler(Exception)
async def unexpected_error_handler(request: Request, exc: Exception) -> JSONResponse:
    LOGGER.exception("Unhandled API failure on %s %s (%s)", request.method, request.url.path, type(exc).__name__)
    return JSONResponse(status_code=500, content={"detail": "Unexpected server error. Submitted clinical values were not logged."})


@app.get("/", include_in_schema=False)
async def root() -> dict[str, str]:
    return {"service": "CardioVision 3D API", "docs": "/docs", "health": "/health"}


@app.get("/health", response_model=HealthResponse, tags=["system"])
async def health(request: Request) -> dict[str, Any]:
    return store_from(request).health()


@app.get("/api/schema", response_model=SchemaResponse, tags=["metadata"])
async def schema(request: Request) -> dict[str, Any]:
    return store_from(request).public_schema()


@app.get("/api/model-metrics", response_model=ModelMetricsResponse, tags=["metadata"])
async def model_metrics(request: Request) -> dict[str, Any]:
    store = store_from(request)
    metrics = store.metrics
    if not metrics.get("targets"):
        return {
            "available": False,
            "status": "pending",
            "targets": {},
            "metadata": metrics.get("metadata", {}),
            "message": "No executed training evaluation is available. Train from the local source dataset to populate metrics.",
        }
    return {
        "available": True,
        "status": "evaluated",
        "targets": metrics.get("targets", {}),
        "metadata": metrics.get("metadata", {}),
        "message": None,
    }


@app.post("/api/predict", response_model=PredictionResponse, tags=["inference"])
async def predict(body: PredictionRequest, request: Request) -> dict[str, Any]:
    return store_from(request).predict(body.features, demo_mode=body.demo_mode)


@app.post("/api/explain", response_model=ExplanationResponse, tags=["explainability"])
async def explain(body: ExplainRequest, request: Request) -> dict[str, Any]:
    return store_from(request).explain(body.target, body.features, body.model_version)


@app.get("/api/demo-patient", response_model=DemoPatientResponse, tags=["demo"])
async def demo_patient(request: Request) -> dict[str, Any]:
    return store_from(request).demo_patient()
