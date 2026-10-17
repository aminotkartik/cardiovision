"""Public HTTP contracts; intentionally independent of scikit-learn internals."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PredictionRequest(StrictModel):
    features: dict[str, Any]
    demo_mode: bool = False


class ExplainRequest(StrictModel):
    target: Literal["cad", "lad", "lcx", "rca"]
    features: dict[str, Any]
    model_version: str | None = None


class TargetPrediction(BaseModel):
    predicted_class: str
    positive_probability: float = Field(ge=0.0, le=1.0)
    threshold: float = Field(ge=0.0, le=1.0)
    positive_class: str
    negative_class: str


class VesselPredictions(BaseModel):
    LAD: TargetPrediction
    LCX: TargetPrediction
    RCA: TargetPrediction


class PredictionResponse(BaseModel):
    prediction_id: str
    model_version: str
    model_versions: dict[str, str]
    demo_mode: bool
    created_at: str
    probability_semantics: str
    cad: TargetPrediction
    vessels: VesselPredictions
    explanation_status: str
    warnings: list[str]


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    service: str
    dependencies: dict[str, str]
    inference_available: bool
    loaded_model_count: int
    model_version: str | None = None
    schema_available: bool
    missing_artifacts: list[str]


class SchemaResponse(BaseModel):
    available: bool
    source: str
    missing_values_supported: bool
    feature_names: list[str] = []
    fields: list[dict[str, Any]] = []
    message: str | None = None


class ModelMetricsResponse(BaseModel):
    available: bool
    status: Literal["pending", "evaluated"]
    targets: dict[str, dict[str, Any]] = {}
    metadata: dict[str, Any] = {}
    message: str | None = None


class DemoPatientResponse(BaseModel):
    synthetic: Literal[True] = True
    demo_mode: Literal[True] = True
    profile_name: str
    generated_at: str
    features: dict[str, Any]
    note: str


class ExplanationResponse(BaseModel):
    target: str
    model_version: str
    method: str
    explanation_status: str
    prediction_probability: float
    baseline_probability: float
    contributions: list[dict[str, Any]]
    global_feature_importance: list[dict[str, Any]]
    global_feature_importance_status: str
    caveats: list[str]
