"""Dataset loading, target discovery, validation and leakage-safe feature selection."""
from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from .schema import (
    DOCUMENTED_OUTCOME_ALIAS_KEYS,
    FORBIDDEN_PREDICTOR_KEYS,
    find_column,
    normalize_frame_columns,
    normalized_key,
)

DEFAULT_TARGETS = {"cad": None, "lad": "LAD", "lcx": "LCX", "rca": "RCA"}
POSITIVE_TOKENS = {"true", "yes", "y", "cad", "positive", "present", "stenosis", "disease", "obstructive"}


def sanitize_non_finite_values(frame: pd.DataFrame) -> pd.DataFrame:
    """Convert numeric infinities to missing values and retain an audit count."""
    result = frame.copy()
    invalid_counts: dict[str, int] = dict(frame.attrs.get("invalid_non_finite_values", {}))
    for column in result.columns:
        series = result[column]
        if pd.api.types.is_numeric_dtype(series.dtype):
            numeric = pd.to_numeric(series, errors="coerce")
        else:
            numeric = pd.to_numeric(series, errors="coerce")
            non_missing_count = int(series.notna().sum())
            if not non_missing_count or float(numeric.notna().sum()) / non_missing_count < 0.98:
                continue
        invalid = np.isinf(numeric.to_numpy(dtype=float, na_value=np.nan))
        count = int(invalid.sum())
        if count:
            invalid_counts[str(column)] = count
            result[column] = numeric.replace([np.inf, -np.inf], np.nan)
    result.attrs["invalid_non_finite_values"] = invalid_counts
    return result


def load_dataset(path: str | Path) -> pd.DataFrame:
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Dataset not found: {path}")
    suffix = path.suffix.lower()
    if suffix in {".xlsx", ".xls"}:
        frame = pd.read_excel(path)
    elif suffix in {".csv", ".txt"}:
        frame = pd.read_csv(path)
    else:
        raise ValueError("Supported datasets are CSV, XLSX or XLS files.")
    if frame.empty:
        raise ValueError("Dataset has no records.")
    return sanitize_non_finite_values(normalize_frame_columns(frame))


def resolve_targets(
    columns: list[str],
    target_overrides: dict[str, str | None] | None = None,
) -> dict[str, str]:
    overrides = target_overrides or {}
    resolved: dict[str, str] = {}
    for target, default in DEFAULT_TARGETS.items():
        requested = overrides.get(target, default)
        if target == "cad" and requested is None:
            requested = "CAD" if find_column(columns, "CAD") else "Cath"
        if not requested:
            raise ValueError(f"No target configured for {target}.")
        found = find_column(columns, requested)
        if found is None:
            raise ValueError(
                f"Target column {requested!r} for {target.upper()} is missing. "
                f"Available columns: {', '.join(columns)}"
            )
        resolved[target] = found
    return resolved


def build_feature_columns(columns: list[str], target_columns: dict[str, str]) -> list[str]:
    target_names = {normalized_key(value) for value in target_columns.values()}
    features: list[str] = []
    for column in columns:
        key = normalized_key(column)
        if key in FORBIDDEN_PREDICTOR_KEYS:
            continue
        # CAD is a documented direct alias for Cath/outcome in some extensions.
        if key in DOCUMENTED_OUTCOME_ALIAS_KEYS:
            continue
        if key in target_names:
            continue
        features.append(column)
    if not features:
        raise ValueError("No eligible input features remain after leakage exclusions.")
    audit_forbidden = [c for c in features if normalized_key(c) in FORBIDDEN_PREDICTOR_KEYS]
    if audit_forbidden:
        raise AssertionError(f"Leakage audit failed: {audit_forbidden}")
    return features


def encode_binary_target(
    series: pd.Series,
    positive_label: str | int | float | bool | None = None,
) -> tuple[pd.Series, dict[str, Any]]:
    """Map a documented positive class to 1; refuse ambiguous encodings."""
    non_missing = series.dropna()
    unique = list(pd.unique(non_missing))
    if len(unique) != 2:
        raise ValueError(f"Target {series.name!r} must have exactly two observed classes; found {unique!r}.")

    def same_label(left: Any, right: Any) -> bool:
        if str(left).strip().casefold() == str(right).strip().casefold():
            return True
        try:
            return float(left) == float(right)
        except (TypeError, ValueError):
            return False

    selected: Any | None = None
    if positive_label is not None:
        matches = [value for value in unique if same_label(value, positive_label)]
        if len(matches) != 1:
            raise ValueError(f"Positive label {positive_label!r} is not present in {series.name!r}: {unique!r}.")
        selected = matches[0]
    else:
        token_matches = [value for value in unique if str(value).strip().casefold() in POSITIVE_TOKENS]
        if len(token_matches) == 1:
            selected = token_matches[0]
        else:
            raise ValueError(
                f"Cannot safely infer the positive class for {series.name!r} from {unique!r}. "
                "Pass an explicit positive-label option after checking the dataset documentation."
            )

    negative = next(value for value in unique if not same_label(value, selected))
    encoded = series.map(lambda value: np.nan if pd.isna(value) else int(same_label(value, selected)))
    encoded = encoded.astype("Int64")
    return encoded, {"negative": str(negative), "positive": str(selected)}


def summarize_dataset(frame: pd.DataFrame, feature_columns: list[str], target_columns: dict[str, str]) -> dict[str, Any]:
    return {
        "records": int(len(frame)),
        "columns": list(frame.columns),
        "duplicate_rows": int(frame.duplicated().sum()),
        "invalid_non_finite_values": dict(frame.attrs.get("invalid_non_finite_values", {})),
        "missing_by_column": {str(k): int(v) for k, v in frame.isna().sum().items()},
        "target_columns": target_columns,
        "feature_columns": feature_columns,
        "forbidden_columns_excluded": sorted(FORBIDDEN_PREDICTOR_KEYS),
    }
