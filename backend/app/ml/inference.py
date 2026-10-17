"""Artifact loading, typed inputs, predictions and local attribution."""
from __future__ import annotations

import json
import logging
import math
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from fastapi import HTTPException

from .schema import DOCUMENTED_OUTCOME_ALIAS_KEYS, FORBIDDEN_PREDICTOR_KEYS, normalized_key

LOGGER = logging.getLogger("cardiovision.inference")
TARGETS = ("cad", "lad", "lcx", "rca")
TARGET_LABELS = {"cad": "CAD", "lad": "LAD", "lcx": "LCX", "rca": "RCA"}


class ArtifactStore:
    def __init__(self, artifact_dir: str | Path | None = None) -> None:
        default_dir = Path(__file__).resolve().parents[2] / "artifacts"
        self.artifact_dir = Path(artifact_dir or os.getenv("CARDIOVISION_ARTIFACT_DIR", default_dir)).resolve()
        self.models: dict[str, Any] = {}
        self.metadata: dict[str, Any] = {}
        self.metrics: dict[str, Any] = {}
        self.schema: dict[str, Any] = {"available": False, "fields": [], "feature_names": []}
        self.missing_artifacts: list[str] = []
        self.reload()

    def _read_json(self, filename: str) -> dict[str, Any] | None:
        path = self.artifact_dir / filename
        if not path.is_file():
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            LOGGER.error("Could not read artifact metadata file %s: %s", filename, type(exc).__name__)
            return None

    def reload(self) -> None:
        self.models = {}
        self.metadata = self._read_json("model_metadata.json") or {}
        self.metrics = self._read_json("metrics.json") or {}
        self.schema = self._read_json("schema.json") or {"available": False, "fields": [], "feature_names": []}
        self.missing_artifacts = []
        target_metadata = self.metadata.get("targets", {})
        for target in TARGETS:
            item = target_metadata.get(target)
            if not item:
                self.missing_artifacts.append(f"model_metadata.json:targets.{target}")
                continue
            pipeline_features = item.get("feature_names", [])
            schema_features = list(self.schema.get("feature_names") or [field.get("name") for field in self.schema.get("fields", [])])
            audit = item.get("leakage_audit", {})
            forbidden_features = [
                name for name in pipeline_features
                if normalized_key(name) in FORBIDDEN_PREDICTOR_KEYS | DOCUMENTED_OUTCOME_ALIAS_KEYS
            ]
            if not pipeline_features or pipeline_features != schema_features:
                self.missing_artifacts.append(f"{target}:feature_schema_mismatch")
                continue
            if audit.get("passed") is not True or forbidden_features:
                self.missing_artifacts.append(f"{target}:leakage_audit_missing_or_failed")
                continue
            pipeline_name = item.get("pipeline_file", f"pipeline_{target}.joblib")
            pipeline_path = self.artifact_dir / pipeline_name
            if not pipeline_path.is_file():
                self.missing_artifacts.append(str(pipeline_path.name))
                continue
            try:
                self.models[target] = joblib.load(pipeline_path)
            except Exception as exc:  # corrupted/unsafe files should degrade service, never fake success
                self.missing_artifacts.append(f"{pipeline_path.name} (load failed: {type(exc).__name__})")
                LOGGER.exception("Failed loading model artifact %s", pipeline_path.name)

        if not self.schema.get("fields"):
            self.schema = {"available": False, "fields": [], "feature_names": []}
            self.missing_artifacts.append("schema.json")
        else:
            self.schema["available"] = True
            self.schema.setdefault("feature_names", [field["name"] for field in self.schema["fields"]])

        # A model set is atomic from the API's perspective: all four independent targets must load.
        if len(self.models) != len(TARGETS):
            for target in TARGETS:
                if target not in self.models and target not in self.missing_artifacts:
                    self.missing_artifacts.append(f"pipeline_{target}.joblib")

    @property
    def inference_available(self) -> bool:
        return (
            self.schema_available
            and len(self.models) == len(TARGETS)
            and all(target in self.metadata.get("targets", {}) for target in TARGETS)
        )

    @property
    def schema_available(self) -> bool:
        return bool(self.schema.get("fields"))

    @property
    def feature_names(self) -> list[str]:
        return list(self.schema.get("feature_names") or [field["name"] for field in self.schema.get("fields", [])])

    def health(self) -> dict[str, Any]:
        versions = [item.get("model_version") for item in self.metadata.get("targets", {}).values() if item.get("model_version")]
        model_version = self.metadata.get("metadata", {}).get("bundle_version")
        if not model_version and len(set(versions)) == 1 and versions:
            model_version = versions[0]
        return {
            "status": "ok" if self.inference_available else "degraded",
            "service": "CardioVision 3D inference API",
            "dependencies": {"python": "available", "scikit_learn": "available", "artifact_store": "available"},
            "inference_available": self.inference_available,
            "loaded_model_count": len(self.models),
            "model_version": model_version,
            "schema_available": self.schema_available,
            "missing_artifacts": sorted(set(self.missing_artifacts)),
        }

    def public_schema(self) -> dict[str, Any]:
        if not self.schema_available:
            return {
                "available": False,
                "source": "No audited local dataset schema has been generated yet.",
                "missing_values_supported": True,
                "feature_names": [],
                "fields": [],
                "message": "Place the licensed source dataset locally, then run the dataset audit or training command. No columns are guessed by the API.",
            }
        return {
            "available": True,
            "source": self.schema.get("source", "Generated from local dataset audit."),
            "missing_values_supported": bool(self.schema.get("missing_values_supported", True)),
            "feature_names": self.feature_names,
            "fields": self.schema.get("fields", []),
            "message": None,
        }

    def demo_patient(self) -> dict[str, Any]:
        if not self.schema_available:
            raise HTTPException(status_code=503, detail="No audited feature schema is available; run the dataset audit first.")
        fields = self.schema.get("fields", [])
        profile = {field["name"]: field.get("demo_value") for field in fields}
        return {
            "synthetic": True,
            "demo_mode": True,
            "profile_name": "Synthetic feature-wise median / mode",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "features": profile,
            "note": "Synthetic profile assembled from per-feature medians/modes in the generated schema. It is not an observed person, has no ground-truth labels, and is not a clinical reference case.",
        }

    def validate_features(self, features: dict[str, Any]) -> tuple[pd.DataFrame, list[str]]:
        if not self.schema_available:
            raise HTTPException(status_code=503, detail="Feature schema is unavailable; audit a local dataset before submitting patient features.")
        feature_names = self.feature_names
        by_name = {field["name"]: field for field in self.schema.get("fields", [])}
        submitted_by_key = {normalized_key(key): key for key in features}
        forbidden = [key for key in features if normalized_key(key) in FORBIDDEN_PREDICTOR_KEYS]
        if forbidden:
            raise HTTPException(status_code=422, detail={"message": "Target/leakage columns cannot be submitted as predictors.", "fields": forbidden})
        unknown = [key for key in features if normalized_key(key) not in {normalized_key(name) for name in feature_names}]
        if unknown:
            raise HTTPException(status_code=422, detail={"message": "Unknown feature fields were submitted.", "fields": unknown})

        canonical: dict[str, Any] = {}
        errors: list[dict[str, str]] = []
        warnings: list[str] = []
        for name in feature_names:
            submitted_name = submitted_by_key.get(normalized_key(name))
            value = features.get(submitted_name) if submitted_name is not None else None
            field = by_name[name]
            if value is None:
                canonical[name] = np.nan
                continue
            if isinstance(value, (dict, list)):
                errors.append({"field": name, "message": "Provide one scalar value or leave the field unknown."})
                continue
            if field.get("type") == "numeric":
                if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
                    errors.append({"field": name, "message": "A finite numeric value is required."})
                    continue
                canonical[name] = float(value)
                observed = field.get("observed_range")
                if observed and (float(value) < observed["min"] or float(value) > observed["max"]):
                    warnings.append(
                        f"{name} is outside the source cohort's observed range ({observed['min']:g}–{observed['max']:g}); this is not a clinical reference range."
                    )
            else:
                options = field.get("options", [])
                def same_option(option: Any) -> bool:
                    if type(option) in (int, float) and type(value) in (int, float):
                        return float(option) == float(value)
                    return str(option).strip().casefold() == str(value).strip().casefold()
                match = next((option for option in options if same_option(option)), None)
                if not any(same_option(option) for option in options):
                    errors.append({"field": name, "message": f"Choose one of the dataset categories: {options!r}."})
                    continue
                canonical[name] = match

        if errors:
            raise HTTPException(status_code=422, detail={"message": "One or more features are invalid.", "fields": errors})
        frame = pd.DataFrame([canonical], columns=feature_names)
        warnings.insert(0, f"{sum(value is None for value in canonical.values())} of {len(feature_names)} feature values are unknown and will be imputed by the fitted pipeline.")
        return frame, warnings

    def _positive_probability(self, target: str, frame: pd.DataFrame) -> float:
        model = self.models[target]
        classifier = model.named_steps.get("classifier") if hasattr(model, "named_steps") else model
        classes = list(classifier.classes_)
        positive_index = next((index for index, value in enumerate(classes) if int(value) == 1), None)
        if positive_index is None:
            raise RuntimeError(f"Model for {target} has no positive class encoded as 1.")
        return float(model.predict_proba(frame)[0, positive_index])

    def predict(self, features: dict[str, Any], demo_mode: bool = False) -> dict[str, Any]:
        frame, warnings = self.validate_features(features)
        if not self.inference_available:
            raise HTTPException(
                status_code=503,
                detail={
                    "message": "Real inference is unavailable because all four fitted model artifacts are required.",
                    "missing_artifacts": sorted(set(self.missing_artifacts)),
                    "next_step": "Run backend/training/train_models.py with the local, licensed dataset.",
                },
            )
        outputs: dict[str, dict[str, Any]] = {}
        versions: dict[str, str] = {}
        for target in TARGETS:
            metadata = self.metadata["targets"][target]
            probability = self._positive_probability(target, frame)
            threshold = float(metadata.get("threshold", 0.5))
            predicted = metadata["positive_class"] if probability >= threshold else metadata["negative_class"]
            outputs[target] = {
                "predicted_class": str(predicted),
                "positive_probability": probability,
                "threshold": threshold,
                "positive_class": str(metadata["positive_class"]),
                "negative_class": str(metadata["negative_class"]),
            }
            versions[target] = str(metadata.get("model_version", "unknown"))
        unique_versions = sorted(set(versions.values()))
        model_version = self.metadata.get("metadata", {}).get("bundle_version") or (unique_versions[0] if len(unique_versions) == 1 else "multi-model-version")
        if len({output["predicted_class"] for output in outputs.values()}) > 1:
            warnings.append("The four independent models returned differing target classes. This is not a contradiction the prototype can resolve; clinical interpretation is outside scope.")
        response = {
            "prediction_id": str(uuid.uuid4()),
            "model_version": model_version,
            "model_versions": versions,
            "demo_mode": bool(demo_mode),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "probability_semantics": "Uncalibrated model score; not a validated clinical absolute risk.",
            "cad": outputs["cad"],
            "vessels": {"LAD": outputs["lad"], "LCX": outputs["lcx"], "RCA": outputs["rca"]},
            "explanation_status": "available: request a target-specific local perturbation explanation" if self.metadata else "unavailable",
            "warnings": warnings,
        }
        LOGGER.info("Inference completed: prediction_id=%s model_version=%s demo=%s", response["prediction_id"], model_version, demo_mode)
        return response

    def explain(self, target: str, features: dict[str, Any], model_version: str | None = None) -> dict[str, Any]:
        if not self.inference_available:
            raise HTTPException(status_code=503, detail="Explanations are unavailable because trained model artifacts are missing.")
        if target not in TARGETS:
            raise HTTPException(status_code=422, detail="Target must be one of cad, lad, lcx, or rca.")
        metadata = self.metadata["targets"][target]
        actual_version = str(metadata.get("model_version", "unknown"))
        if model_version and model_version != actual_version:
            raise HTTPException(status_code=409, detail={"message": "Model version mismatch.", "current_model_version": actual_version})
        frame, _ = self.validate_features(features)
        probability = self._positive_probability(target, frame)
        baseline = metadata.get("training_baseline", {})
        variants: list[pd.DataFrame] = []
        variant_fields: list[str] = []
        contributions: list[dict[str, Any]] = []
        original = frame.iloc[0].to_dict()
        for name in self.feature_names:
            baseline_value = baseline.get(name)
            current_value = original.get(name)
            if baseline_value is None or pd.isna(current_value):
                contributions.append({
                    "feature": name,
                    "observed_value": None if pd.isna(current_value) else current_value,
                    "baseline_value": baseline_value,
                    "contribution": None,
                    "direction": "unavailable",
                    "status": "missing input or baseline",
                })
                continue
            variant = frame.copy()
            variant.loc[0, name] = baseline_value
            variants.append(variant)
            variant_fields.append(name)
        if variants:
            variant_frame = pd.concat(variants, ignore_index=True)
            base_probabilities = self.models[target].predict_proba(variant_frame)
            classifier = self.models[target].named_steps.get("classifier")
            classes = list(classifier.classes_)
            positive_index = next(index for index, value in enumerate(classes) if int(value) == 1)
            for name, row_index in zip(variant_fields, range(len(variant_fields))):
                replaced_probability = float(base_probabilities[row_index, positive_index])
                effect = probability - replaced_probability
                value = original[name]
                contributions.append({
                    "feature": name,
                    "observed_value": value.item() if hasattr(value, "item") else value,
                    "baseline_value": baseline.get(name),
                    "contribution": effect,
                    "direction": "raises score versus baseline" if effect > 1e-9 else "lowers score versus baseline" if effect < -1e-9 else "no change versus baseline",
                    "status": "approximate single-feature perturbation",
                })
        contributions.sort(key=lambda item: abs(item["contribution"]) if item["contribution"] is not None else -1, reverse=True)
        metric_target = self.metrics.get("targets", {}).get(target, {})
        global_importance = metric_target.get("global_feature_importance", [])
        return {
            "target": target,
            "model_version": actual_version,
            "method": "local single-feature baseline perturbation",
            "explanation_status": "available_approximate",
            "prediction_probability": probability,
            "baseline_probability": self._positive_probability(target, pd.DataFrame([baseline], columns=self.feature_names)),
            "contributions": contributions,
            "global_feature_importance": global_importance,
            "global_feature_importance_status": metric_target.get("global_feature_importance_status", "unavailable: not present in saved metrics"),
            "caveats": [
                "Local values are score changes after replacing one supplied feature with its training-partition median/mode while keeping other inputs fixed.",
                "The effects are approximate, non-additive, and sensitive to correlated features and the selected model.",
                "Feature attribution is not causal evidence and is not a clinical mechanism or diagnostic finding.",
                "Global permutation importance and the local explanation refer only to this selected target model.",
            ],
        }
