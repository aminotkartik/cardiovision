"""Train four leakage-safe binary classifiers from an explicitly supplied dataset.

Example: python -m training.train_models --data ../data/z_alizadeh_sani_extension.csv
"""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
import math
import sys
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import make_scorer, f1_score, precision_score, recall_score
from sklearn.model_selection import RepeatedStratifiedKFold, cross_validate, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.inspection import permutation_importance

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.ml.data import build_feature_columns, encode_binary_target, load_dataset, resolve_targets, sanitize_non_finite_values, summarize_dataset
from app.ml.metrics import evaluate_binary
from app.ml.schema import FORBIDDEN_PREDICTOR_KEYS, infer_feature_schema, leakage_audit_columns, normalized_key, normalize_frame_columns, to_json_value

LOGGER = logging.getLogger("cardiovision.training")
TARGETS = ("cad", "lad", "lcx", "rca")


def _simple_imputer(strategy: str) -> SimpleImputer:
    try:
        return SimpleImputer(strategy=strategy, keep_empty_features=True)
    except TypeError:  # sklearn versions before keep_empty_features
        return SimpleImputer(strategy=strategy)


def _one_hot_encoder() -> OneHotEncoder:
    try:
        return OneHotEncoder(handle_unknown="ignore", sparse_output=False)
    except TypeError:  # sklearn versions before sparse_output
        return OneHotEncoder(handle_unknown="ignore", sparse=False)


def make_pipeline(model: Any, numeric_columns: list[str], categorical_columns: list[str]) -> Pipeline:
    transformers: list[tuple[str, Pipeline, list[str]]] = []
    if numeric_columns:
        transformers.append((
            "numeric",
            Pipeline([
                ("imputer", _simple_imputer("median")),
                ("scaler", StandardScaler()),
            ]),
            numeric_columns,
        ))
    if categorical_columns:
        transformers.append((
            "categorical",
            Pipeline([
                ("imputer", _simple_imputer("most_frequent")),
                ("onehot", _one_hot_encoder()),
            ]),
            categorical_columns,
        ))
    preprocessing = ColumnTransformer(transformers, remainder="drop", sparse_threshold=0)
    return Pipeline([("preprocess", preprocessing), ("classifier", model)])


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        value = float(value)
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return to_json_value(value)


def _training_baseline(frame: pd.DataFrame, schema: dict[str, Any]) -> None:
    lookup = {field["name"]: field for field in schema["fields"]}
    for name in frame.columns:
        field = lookup[name]
        series = frame[name].dropna()
        if not len(series):
            field["demo_value"] = None
        elif field["type"] == "numeric":
            values = pd.to_numeric(series, errors="coerce").dropna()
            field["demo_value"] = float(values.median()) if len(values) else None
        else:
            modes = series.mode(dropna=True)
            field["demo_value"] = to_json_value(modes.iloc[0]) if len(modes) else None


def train_from_frame(
    frame: pd.DataFrame,
    output_dir: str | Path,
    *,
    target_overrides: dict[str, str | None] | None = None,
    positive_labels: dict[str, str | int | float | bool | None] | None = None,
    random_seed: int = 42,
    test_size: float = 0.2,
    repeats: int = 3,
) -> dict[str, Any]:
    frame = sanitize_non_finite_values(normalize_frame_columns(frame))
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    positive_labels = positive_labels or {}
    targets = resolve_targets(list(frame.columns), target_overrides)
    feature_columns = build_feature_columns(list(frame.columns), targets)
    leakage_audit = leakage_audit_columns(feature_columns)
    if not leakage_audit["passed"]:
        raise RuntimeError(f"Leakage audit failed: {leakage_audit}")

    feature_schema = infer_feature_schema(frame, feature_columns)
    # Infer categorical/numeric pipeline columns from the schema, not from test labels.
    numeric_columns = [field["name"] for field in feature_schema["fields"] if field["type"] == "numeric"]
    categorical_columns = [field["name"] for field in feature_schema["fields"] if field["type"] == "categorical"]
    X_all = frame[feature_columns].copy()
    for name in numeric_columns:
        X_all[name] = pd.to_numeric(X_all[name], errors="coerce")
    for name in categorical_columns:
        X_all[name] = X_all[name].map(lambda value: str(value).strip() if isinstance(value, str) else value)

    schema = feature_schema
    schema["feature_names"] = feature_columns
    schema["target_names"] = targets
    schema["schema_version"] = 1
    schema["source"] = "Generated from the explicitly supplied local dataset; see dataset provenance in docs."

    bundle_fingerprint = hashlib.sha256(pd.util.hash_pandas_object(frame, index=False).values.tobytes()).hexdigest()[:12]
    bundle_version = f"cv-{bundle_fingerprint}-seed{random_seed}"
    artifact_metrics: dict[str, Any] = {}
    model_metadata: dict[str, Any] = {}
    leakage_audits: dict[str, Any] = {}
    models: dict[str, Any] = {}

    model_factories = [
        ("logistic_regression", lambda seed: LogisticRegression(max_iter=3000, class_weight="balanced", random_state=seed)),
        ("random_forest", lambda seed: RandomForestClassifier(
            n_estimators=300, min_samples_leaf=2, class_weight="balanced_subsample", random_state=seed, n_jobs=-1
        )),
        ("gradient_boosting", lambda seed: GradientBoostingClassifier(
            n_estimators=100, learning_rate=0.05, max_depth=2, random_state=seed
        )),
    ]

    for target_key in TARGETS:
        target_column = targets[target_key]
        encoded, class_mapping = encode_binary_target(frame[target_column], positive_labels.get(target_key))
        mask = encoded.notna()
        X = X_all.loc[mask].reset_index(drop=True)
        y = encoded.loc[mask].astype(int).to_numpy()
        counts = np.bincount(y, minlength=2)
        if len(y) < 8 or counts.min() < 3:
            raise ValueError(
                f"Target {target_column!r} needs at least 3 observations per class and 8 labeled rows; "
                f"found negative={int(counts[0])}, positive={int(counts[1])}."
            )
        if not 0 < test_size < 0.5:
            raise ValueError("test_size must be between 0 and 0.5.")

        n_test = max(int(math.ceil(len(y) * test_size)), 2)
        n_test = min(n_test, len(y) - 2)
        row_positions = np.flatnonzero(mask.to_numpy())
        X_train, X_test, y_train, y_test, train_positions, test_positions = train_test_split(
            X, y, row_positions, test_size=n_test, random_state=random_seed, stratify=y
        )
        train_counts = np.bincount(y_train, minlength=2)
        cv_splits = min(5, int(train_counts.min()))
        if cv_splits < 2:
            raise ValueError(f"Target {target_column!r} has too few minority-class training examples for stratified CV.")
        cv = RepeatedStratifiedKFold(n_splits=cv_splits, n_repeats=max(1, repeats), random_state=random_seed)
        scorers = {
            "roc_auc": "roc_auc",
            "accuracy": "accuracy",
            "precision": make_scorer(precision_score, zero_division=0),
            "recall": make_scorer(recall_score, zero_division=0),
            "f1": make_scorer(f1_score, zero_division=0),
        }
        comparisons: list[dict[str, Any]] = []
        candidate_pipelines: dict[str, Pipeline] = {}
        for family, factory in model_factories:
            pipeline = make_pipeline(factory(random_seed), numeric_columns, categorical_columns)
            scores = cross_validate(
                pipeline,
                X_train,
                y_train,
                cv=cv,
                scoring=scorers,
                n_jobs=1,
                return_train_score=False,
                error_score="raise",
            )
            summaries = {
                metric: {"mean": float(np.mean(values)), "std": float(np.std(values, ddof=1)) if len(values) > 1 else 0.0}
                for metric, values in scores.items()
                if metric.startswith("test_")
                for metric in [metric.removeprefix("test_")]
            }
            comparisons.append({"model_family": family, "cross_validation": summaries})
            candidate_pipelines[family] = pipeline

        # Selection is based only on repeated CV of the training partition.
        selected = max(comparisons, key=lambda item: item["cross_validation"]["roc_auc"]["mean"])
        selected_family = selected["model_family"]
        fitted = candidate_pipelines[selected_family]
        fitted.fit(X_train, y_train)
        test_probabilities = fitted.predict_proba(X_test)[:, list(fitted.named_steps["classifier"].classes_).index(1)]
        # Threshold is predeclared at 0.50; no held-out labels are used to tune it.
        threshold = 0.5
        heldout = evaluate_binary(y_test, test_probabilities, threshold)
        heldout["class_distribution"] = {
            "negative": int(np.sum(y_test == 0)),
            "positive": int(np.sum(y_test == 1)),
        }

        importance: list[dict[str, Any]] = []
        importance_status = "unavailable: test partition did not contain both classes"
        if len(np.unique(y_test)) == 2:
            try:
                permutation = permutation_importance(
                    fitted, X_test, y_test, scoring="roc_auc", n_repeats=5, random_state=random_seed, n_jobs=1
                )
                order = np.argsort(permutation.importances_mean)[::-1][: min(15, len(feature_columns))]
                importance = [
                    {
                        "feature": feature_columns[index],
                        "mean_decrease_score": float(permutation.importances_mean[index]),
                        "std": float(permutation.importances_std[index]),
                    }
                    for index in order
                ]
                importance_status = "permutation importance on held-out test data; descriptive, not causal"
            except Exception as exc:  # metrics remain usable if one estimator cannot be permuted
                importance_status = f"unavailable: {type(exc).__name__}"

        model_version = f"{bundle_version}-{target_key}"
        pipeline_path = output / f"pipeline_{target_key}.joblib"
        joblib.dump(fitted, pipeline_path)
        model_metadata[target_key] = {
            "target": target_key,
            "target_column": target_column,
            "selected_model_family": selected_family,
            "model_version": model_version,
            "positive_class": class_mapping["positive"],
            "negative_class": class_mapping["negative"],
            "class_mapping": {"0": class_mapping["negative"], "1": class_mapping["positive"]},
            "threshold": threshold,
            "probability_semantics": "uncalibrated model score; not a clinical absolute risk",
            "selected_by": "highest mean ROC-AUC across repeated stratified training-only CV; ties follow configured family order",
            "cross_validation": selected["cross_validation"],
            "candidate_comparison": comparisons,
            "training_rows": int(len(X_train)),
            "test_rows": int(len(X_test)),
            "cv_splits": cv_splits,
            "cv_repeats": max(1, repeats),
            "split": {"training_row_positions": train_positions.tolist(), "test_row_positions": test_positions.tolist()},
            "training_configuration": {
                "random_seed": random_seed,
                "test_size_fraction": test_size,
                "threshold": threshold,
                "preprocessing": "median imputation + standard scaling for numeric; most-frequent imputation + one-hot encoding for categorical",
                "class_weighting": {"logistic_regression": "balanced", "random_forest": "balanced_subsample", "gradient_boosting": "not configured"},
            },
            "class_distribution": {"negative": int(counts[0]), "positive": int(counts[1])},
            "train_class_distribution": {"negative": int(train_counts[0]), "positive": int(train_counts[1])},
            "evaluation": heldout,
            "global_feature_importance": importance,
            "global_feature_importance_status": importance_status,
            "explanation_method": "local single-feature baseline perturbation; approximate and non-additive",
            "pipeline_file": pipeline_path.name,
            "training_baseline": {
                column: to_json_value(X_train[column].median()) if column in numeric_columns else to_json_value(X_train[column].mode(dropna=True).iloc[0]) if len(X_train[column].mode(dropna=True)) else None
                for column in feature_columns
            },
            "feature_names": list(feature_columns),
            "excluded_columns": sorted(
                set(column for column in frame.columns if normalized_key(column) in FORBIDDEN_PREDICTOR_KEYS)
                | {column for column in frame.columns if normalized_key(column) in {"cad"} }
                | {column for column in targets.values()}
            ),
            "leakage_audit": leakage_audit,
            "random_seed": random_seed,
        }
        artifact_metrics[target_key] = {
            "target": target_key,
            "target_column": target_column,
            "model_version": model_version,
            "selected_model_family": selected_family,
            "threshold": threshold,
            "positive_class": class_mapping["positive"],
            "negative_class": class_mapping["negative"],
            "evaluation": heldout,
            "cross_validation": selected["cross_validation"],
            "candidate_comparison": comparisons,
            "training_rows": int(len(X_train)),
            "test_rows": int(len(X_test)),
            "class_distribution": {"negative": int(counts[0]), "positive": int(counts[1])},
            "global_feature_importance": importance,
            "global_feature_importance_status": importance_status,
            "leakage_audit": leakage_audit,
            "probability_semantics": "uncalibrated model score; not a clinical absolute risk",
        }
        leakage_audits[target_key] = leakage_audit
        models[target_key] = fitted
        LOGGER.info(
            "%s: selected %s (CV ROC-AUC %.3f ± %.3f), held-out ROC-AUC %s; input fields=%d",
            target_key.upper(), selected_family,
            selected["cross_validation"]["roc_auc"]["mean"],
            selected["cross_validation"]["roc_auc"]["std"],
            heldout["roc_auc"], len(feature_columns),
        )

    # Feature-wise medians/modes are generated from training data for a clearly labeled synthetic demo.
    first_target = TARGETS[0]
    cad_target_col = targets[first_target]
    cad_encoded, _ = encode_binary_target(frame[cad_target_col], positive_labels.get(first_target))
    cad_mask = cad_encoded.notna()
    baseline_rows, _, _, _ = train_test_split(
        X_all.loc[cad_mask].reset_index(drop=True),
        cad_encoded.loc[cad_mask].astype(int).to_numpy(),
        test_size=max(2, min(int(math.ceil(int(cad_mask.sum()) * test_size)), int(cad_mask.sum()) - 2)),
        random_state=random_seed,
        stratify=cad_encoded.loc[cad_mask].astype(int).to_numpy(),
    )
    _training_baseline(baseline_rows, schema)

    dataset_summary = summarize_dataset(frame, feature_columns, targets)
    dataset_summary.update({
        "bundle_version": bundle_version,
        "training_rows_by_target": {key: model_metadata[key]["training_rows"] for key in TARGETS},
        "test_rows_by_target": {key: model_metadata[key]["test_rows"] for key in TARGETS},
        "evaluation_method": "stratified 80/20 holdout per target; model family selected using repeated stratified CV on the training partition",
        "positive_class_definitions": {key: model_metadata[key]["positive_class"] for key in TARGETS},
        "random_seed": random_seed,
        "test_size_fraction": test_size,
        "cross_validation_repeats": max(1, repeats),
        "scikit_learn_version": sklearn.__version__,
        "threshold_policy": "fixed at 0.50 before test evaluation; no test-based threshold tuning",
        "calibration": "not calibrated; probability outputs are unvalidated model scores",
        "selected_model_families": {key: model_metadata[key]["selected_model_family"] for key in TARGETS},
    })

    (output / "schema.json").write_text(json.dumps(_json_safe(schema), indent=2), encoding="utf-8")
    (output / "metrics.json").write_text(json.dumps(_json_safe({"targets": artifact_metrics, "metadata": dataset_summary}), indent=2), encoding="utf-8")
    (output / "model_metadata.json").write_text(json.dumps(_json_safe({"targets": model_metadata, "metadata": dataset_summary}), indent=2), encoding="utf-8")
    (output / "leakage_audit.json").write_text(json.dumps(_json_safe({"targets": leakage_audits}), indent=2), encoding="utf-8")
    print("LEAKAGE AUDIT")
    for key, audit in leakage_audits.items():
        print(f"{key.upper()}: passed={audit['passed']} | final inputs ({len(audit['final_input_columns'])}): {', '.join(audit['final_input_columns'])}")
        print(f"  forbidden columns remaining: {audit['forbidden_columns_remaining']}")
    print(f"Saved model artifacts and evaluation JSON to {output}")
    return {"metrics": artifact_metrics, "metadata": dataset_summary, "models": models, "schema": schema}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", required=True, help="Local CSV/XLSX dataset path; data are not downloaded or uploaded.")
    parser.add_argument("--output-dir", default=str(ROOT / "artifacts"), help="Artifact directory (default: backend/artifacts).")
    parser.add_argument("--cad-target", default=None, help="Overall target column; auto-selects CAD, then Cath.")
    parser.add_argument("--lad-target", default="LAD")
    parser.add_argument("--lcx-target", default="LCX")
    parser.add_argument("--rca-target", default="RCA")
    parser.add_argument("--cad-positive-label", default=None, help="Explicit positive CAD label if not inferable from documented values.")
    parser.add_argument("--lad-positive-label", default=None)
    parser.add_argument("--lcx-positive-label", default=None)
    parser.add_argument("--rca-positive-label", default=None)
    parser.add_argument("--random-seed", type=int, default=42)
    parser.add_argument("--test-size", type=float, default=0.2)
    parser.add_argument("--cv-repeats", type=int, default=3)
    return parser.parse_args()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    args = parse_args()
    frame = load_dataset(args.data)
    target_overrides = {
        "cad": args.cad_target,
        "lad": args.lad_target,
        "lcx": args.lcx_target,
        "rca": args.rca_target,
    }
    positive_labels = {
        "cad": args.cad_positive_label,
        "lad": args.lad_positive_label,
        "lcx": args.lcx_positive_label,
        "rca": args.rca_positive_label,
    }
    train_from_frame(
        frame,
        args.output_dir,
        target_overrides=target_overrides,
        positive_labels=positive_labels,
        random_seed=args.random_seed,
        test_size=args.test_size,
        repeats=args.cv_repeats,
    )


if __name__ == "__main__":
    main()
