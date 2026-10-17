from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.main import app
from app.ml.inference import ArtifactStore


def test_health_and_missing_model_state(monkeypatch, tmp_path):
    monkeypatch.setenv("CARDIOVISION_ARTIFACT_DIR", str(tmp_path))
    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "degraded"
        assert response.json()["inference_available"] is False
        assert response.json()["loaded_model_count"] == 0

        metrics = client.get("/api/model-metrics").json()
        assert metrics["available"] is False

        prediction = client.post("/api/predict", json={"features": {}})
        assert prediction.status_code == 503


def test_schema_and_forbidden_input_validation_without_models(monkeypatch, tmp_path):
    schema = {
        "available": True,
        "source": "test schema",
        "missing_values_supported": True,
        "feature_names": ["Age", "Sex"],
        "fields": [
            {"name": "Age", "type": "numeric", "options": [], "observed_range": {"min": 30, "max": 80}},
            {"name": "Sex", "type": "categorical", "options": ["Female", "Male"], "observed_range": None},
        ],
    }
    (tmp_path / "schema.json").write_text(json.dumps(schema))
    store = ArtifactStore(tmp_path)
    _, range_warnings = store.validate_features({"Age": 130})
    assert any("not a clinical reference range" in warning for warning in range_warnings)
    monkeypatch.setenv("CARDIOVISION_ARTIFACT_DIR", str(tmp_path))
    with TestClient(app) as client:
        assert client.get("/api/schema").json()["available"] is True
        forbidden = client.post("/api/predict", json={"features": {"Age": 55, "LAD": 1}})
        assert forbidden.status_code == 422
        unknown = client.post("/api/predict", json={"features": {"Age": 55, "MadeUp": 1}})
        assert unknown.status_code == 422
        malformed = client.post("/api/predict", json={"features": {"Age": "old"}})
        assert malformed.status_code == 422
        category = client.post("/api/predict", json={"features": {"Age": 55, "Sex": "Other"}})
        assert category.status_code == 422
        out_of_cohort = client.post("/api/predict", json={"features": {"Age": 130}})
        assert out_of_cohort.status_code == 503


def test_end_to_end_demo_prediction_explanation_and_metrics(monkeypatch, trained_artifacts):
    monkeypatch.setenv("CARDIOVISION_ARTIFACT_DIR", str(trained_artifacts))
    with TestClient(app) as client:
        health = client.get("/health").json()
        assert health["inference_available"] is True
        assert health["loaded_model_count"] == 4

        schema = client.get("/api/schema").json()
        assert schema["available"] is True
        assert schema["feature_names"] == ["Age", "Sex", "BP"]

        demo = client.get("/api/demo-patient")
        assert demo.status_code == 200
        demo_body = demo.json()
        assert demo_body["synthetic"] is True
        assert not any(key in demo_body["features"] for key in ["CAD", "Cath", "LAD", "LCX", "RCA"])

        prediction = client.post("/api/predict", json={"features": demo_body["features"], "demo_mode": True})
        assert prediction.status_code == 200
        body = prediction.json()
        assert body["demo_mode"] is True
        assert set(body["vessels"]) == {"LAD", "LCX", "RCA"}
        assert body["model_versions"]["lad"].endswith("-lad")
        assert 0 <= body["vessels"]["LCX"]["positive_probability"] <= 1

        explain = client.post("/api/explain", json={
            "target": "lad", "features": demo_body["features"], "model_version": body["model_versions"]["lad"],
        })
        assert explain.status_code == 200
        assert explain.json()["target"] == "lad"
        assert explain.json()["explanation_status"] == "available_approximate"
        assert client.get("/api/model-metrics").json()["available"] is True
