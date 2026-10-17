"""Metrics helpers that explicitly handle undefined and one-class evaluations."""
from __future__ import annotations

from typing import Any

import numpy as np
from sklearn.metrics import (
    accuracy_score,
    auc,
    confusion_matrix,
    f1_score,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)


def evaluate_binary(y_true: Any, probabilities: Any, threshold: float = 0.5) -> dict[str, Any]:
    y = np.asarray(y_true, dtype=int)
    p = np.asarray(probabilities, dtype=float)
    if len(y) != len(p):
        raise ValueError("y_true and probabilities must have equal length.")
    predicted = (p >= threshold).astype(int)
    labels = [0, 1]
    result: dict[str, Any] = {
        "sample_count": int(len(y)),
        "threshold": float(threshold),
        "accuracy": float(accuracy_score(y, predicted)) if len(y) else None,
        "precision": float(precision_score(y, predicted, zero_division=0)) if len(y) else None,
        "recall": float(recall_score(y, predicted, zero_division=0)) if len(y) else None,
        "f1": float(f1_score(y, predicted, zero_division=0)) if len(y) else None,
        "confusion_matrix": confusion_matrix(y, predicted, labels=labels).tolist() if len(y) else [[0, 0], [0, 0]],
        "class_distribution": {
            "negative": int(np.sum(y == 0)),
            "positive": int(np.sum(y == 1)),
        },
        "roc_auc": None,
        "roc_curve": None,
        "precision_recall_curve": None,
        "curve_status": "unavailable: evaluation requires both classes",
    }
    if len(np.unique(y)) == 2:
        result["roc_auc"] = float(roc_auc_score(y, p))
        fpr, tpr, roc_thresholds = roc_curve(y, p)
        precision, recall, pr_thresholds = precision_recall_curve(y, p)
        result["roc_curve"] = {
            "fpr": fpr.tolist(),
            "tpr": tpr.tolist(),
            "thresholds": roc_thresholds.tolist(),
        }
        result["precision_recall_curve"] = {
            "precision": precision.tolist(),
            "recall": recall.tolist(),
            "thresholds": pr_thresholds.tolist(),
            "average_precision": float(auc(recall, precision)),
        }
        result["curve_status"] = "available"
    return result
