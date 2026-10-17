from __future__ import annotations

import json
import shutil

import joblib
import numpy as np
import pandas as pd
import pytest

from app.ml.data import build_feature_columns, encode_binary_target, sanitize_non_finite_values
from app.ml.inference import ArtifactStore
from app.ml.metrics import evaluate_binary
from app.ml.schema import leakage_audit_columns, normalize_frame_columns


def test_forbidden_predictors_removed_even_with_case_and_spacing_variants():
    columns = ["Age", "  lAd  ", "LCX", "R c a", "Cath", "CAD", "BP"]
    frame = normalize_frame_columns(pd.DataFrame(columns=columns))
    features = build_feature_columns(list(frame.columns), {"cad": "Cath", "lad": "lAd", "lcx": "LCX", "rca": "R c a"})
    assert features == ["Age", "BP"]
    audit = leakage_audit_columns(features)
    assert audit["passed"] is True
    assert audit["forbidden_columns_remaining"] == []


def test_binary_encoding_requires_unambiguous_positive_class():
    encoded, mapping = encode_binary_target(pd.Series(["CAD", "Normal", "CAD"], name="Cath"))
    assert encoded.tolist() == [1, 0, 1]
    assert mapping == {"negative": "Normal", "positive": "CAD"}
    with pytest.raises(ValueError, match="Cannot safely infer"):
        encode_binary_target(pd.Series(["affected", "unaffected"], name="target"))
    with pytest.raises(ValueError, match="Cannot safely infer"):
        encode_binary_target(pd.Series([0, 1, 0, 1], name="coded target"))
    numeric, numeric_mapping = encode_binary_target(pd.Series([0, 1, 0], name="coded target"), positive_label="1")
    assert numeric.tolist() == [0, 1, 0]
    assert numeric_mapping["positive"] == "1"


def test_metric_computation_handles_one_class_evaluation():
    result = evaluate_binary([1, 1, 1], [0.7, 0.4, 0.8], threshold=0.5)
    assert result["accuracy"] == pytest.approx(2 / 3)
    assert result["roc_auc"] is None
    assert result["roc_curve"] is None
    assert result["class_distribution"] == {"negative": 0, "positive": 3}
    assert result["confusion_matrix"] == [[0, 0], [1, 2]]


def test_invalid_non_finite_measurements_are_audited_as_missing():
    frame = sanitize_non_finite_values(pd.DataFrame({"Age": [55.0, np.inf, -np.inf], "Sex": ["F", "M", "F"]}))
    assert frame["Age"].isna().tolist() == [False, True, True]
    assert frame.attrs["invalid_non_finite_values"] == {"Age": 2}


def test_train_persist_reload_and_infer_without_target_leakage(trained_artifacts):
    artifacts = trained_artifacts
    for name in ["pipeline_cad.joblib", "pipeline_lad.joblib", "pipeline_lcx.joblib", "pipeline_rca.joblib"]:
        assert (artifacts / name).is_file()
    metrics = json.loads((artifacts / "metrics.json").read_text())
    metadata = json.loads((artifacts / "model_metadata.json").read_text())
    for target in ["cad", "lad", "lcx", "rca"]:
        assert metrics["targets"][target]["evaluation"]["sample_count"] > 0
        assert metrics["targets"][target]["leakage_audit"]["passed"]
        assert metrics["targets"][target]["evaluation"]["threshold"] == 0.5
        assert set(metrics["targets"][target]["leakage_audit"]["final_input_columns"]) == {"Age", "Sex", "BP"}
        assert metadata["targets"][target]["split"]["training_row_positions"]
        assert metadata["targets"][target]["split"]["test_row_positions"]

    store = ArtifactStore(artifacts)
    assert store.inference_available
    assert store.schema_available
    demo = store.demo_patient()
    assert demo["synthetic"] is True
    assert "CAD" not in demo["features"] and "LAD" not in demo["features"]
    result = store.predict(demo["features"], demo_mode=True)
    assert result["demo_mode"] is True
    assert 0 <= result["cad"]["positive_probability"] <= 1
    assert set(result["vessels"]) == {"LAD", "LCX", "RCA"}
    assert result["model_version"].startswith("cv-")
    assert result["model_versions"]["lad"].endswith("-lad")


def test_preprocessing_fitted_only_on_training_partition(trained_artifacts, training_frame):
    metadata = json.loads((trained_artifacts / "model_metadata.json").read_text())
    split = metadata["targets"]["cad"]["split"]
    expected_age_median = training_frame.iloc[split["training_row_positions"]]["Age"].median()
    pipeline = joblib.load(trained_artifacts / "pipeline_cad.joblib")
    numeric_imputer = pipeline.named_steps["preprocess"].named_transformers_["numeric"].named_steps["imputer"]
    assert numeric_imputer.statistics_[0] == pytest.approx(expected_age_median)


def test_artifact_loader_refuses_failed_leakage_audit(trained_artifacts, tmp_path):
    artifact_copy = tmp_path / "unsafe-artifacts"
    shutil.copytree(trained_artifacts, artifact_copy)
    metadata_path = artifact_copy / "model_metadata.json"
    metadata = json.loads(metadata_path.read_text())
    metadata["targets"]["cad"]["leakage_audit"]["passed"] = False
    metadata_path.write_text(json.dumps(metadata))
    store = ArtifactStore(artifact_copy)
    assert store.inference_available is False
    assert "cad:leakage_audit_missing_or_failed" in store.missing_artifacts


def test_preprocessing_pipeline_accepts_missing_values(trained_artifacts):
    store = ArtifactStore(trained_artifacts)
    output = store.predict({"Age": None, "Sex": "Female", "BP": None})
    assert 0 <= output["cad"]["positive_probability"] <= 1
    assert any("unknown" in warning for warning in output["warnings"])


def test_positive_probability_uses_encoded_positive_class_index(trained_artifacts):
    store = ArtifactStore(trained_artifacts)
    model = store.models["lad"]
    classifier = model.named_steps["classifier"]
    input_frame, _ = store.validate_features({"Age": 62.0, "Sex": "Male", "BP": 128.0})
    expected = model.predict_proba(input_frame)[0, list(classifier.classes_).index(1)]
    assert store._positive_probability("lad", input_frame) == pytest.approx(expected)


def test_local_explanation_uses_model_perturbations(trained_artifacts):
    store = ArtifactStore(trained_artifacts)
    result = store.explain("lad", {"Age": 64.0, "Sex": "Female", "BP": 132.0})
    assert result["target"] == "lad"
    assert result["explanation_status"] == "available_approximate"
    assert any(item["contribution"] is not None for item in result["contributions"])
    assert "causal evidence" in result["caveats"][2]
