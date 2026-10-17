"""Schema inference helpers shared by dataset audit, training and inference."""
from __future__ import annotations

import math
import re
from typing import Any

import numpy as np
import pandas as pd

FORBIDDEN_PREDICTOR_KEYS = {"lad", "lcx", "rca", "cath"}
# CAD is a documented alias for the overall outcome in some dataset extensions.
# It is excluded only when that column is present, even if Cath is selected.
DOCUMENTED_OUTCOME_ALIAS_KEYS = {"cad"}

DESCRIPTION_BY_KEY = {
    "age": "Patient age as recorded in the source dataset.",
    "weight": "Body weight as recorded in the source dataset.",
    "length": "Body length/height measurement as recorded in the source dataset.",
    "sex": "Sex category using the labels or coding present in the source dataset.",
    "bmi": "Body mass index as recorded in the source dataset.",
    "dm": "Diabetes mellitus status as encoded in the source dataset.",
    "htn": "Hypertension status as encoded in the source dataset.",
    "currentsmoker": "Current smoking status as encoded in the source dataset.",
    "exsmoker": "Former smoking status as encoded in the source dataset.",
    "fh": "Family history status as encoded in the source dataset.",
    "bp": "Blood pressure measurement as labeled in the source dataset.",
    "pr": "Pulse-rate measurement as labeled in the source dataset.",
    "fbs": "Fasting blood sugar measurement as recorded in the source dataset.",
    "ldl": "Low-density lipoprotein measurement as recorded in the source dataset.",
    "hdl": "High-density lipoprotein measurement as recorded in the source dataset.",
    "tg": "Triglyceride measurement as recorded in the source dataset.",
    "bun": "Blood urea nitrogen measurement as recorded in the source dataset.",
    "qwave": "Q-wave ECG feature using the source dataset's encoding.",
    "stelevation": "ST-elevation ECG feature using the source dataset's encoding.",
    "stdepression": "ST-depression ECG feature using the source dataset's encoding.",
    "tinversion": "T-wave inversion ECG feature using the source dataset's encoding.",
    "lvh": "Left-ventricular hypertrophy feature using the source dataset's encoding.",
    "poorrprogression": "Poor R-wave progression ECG feature using the source dataset's encoding.",
    "eftte": "Ejection-fraction value from transthoracic echocardiography, as recorded in the source.",
    "regionrwma": "Source-recorded region/category for regional wall-motion abnormality; not a 3D lesion coordinate.",
}

UNIT_BY_KEY = {
    "age": "years",
    "weight": "kg",
    "length": "cm",
    "bmi": "kg/m²",
    "bp": "mmHg",
    "pr": "beats/min",
    "fbs": "mg/dL",
    "cr": "mg/dL",
    "creatinine": "mg/dL",
    "tg": "mg/dL",
    "ldl": "mg/dL",
    "hdl": "mg/dL",
    "bun": "mg/dL",
    "esr": "mm/h",
    "hb": "g/dL",
    "k": "mEq/L",
    "na": "mEq/L",
    "ef-tte": "%",
    "eftte": "%",
    "mets": "METs",
    "peakhr": "beats/min",
    "peakbp": "mmHg",
}

NUMERIC_CODED_CATEGORIES = {
    "sex", "dm", "htn", "currentsmoker", "exsmoker", "fh", "obesity", "crf", "cva",
    "airwaydisease", "thyroiddisease", "chf", "dlp", "weakperipheralpulses", "lungrales",
    "systolicmurmur", "diastolicmurmur", "typicalchestpain", "dyspnea", "atypical",
    "nonanginal", "exertionalcp", "lowthang", "qwave", "stelevation", "stdepression",
    "tinversion", "lvh", "poorrprogression", "regionrwma", "vhd", "rhythm",
}

GROUP_KEYS = {
    "demographics": {"age", "sex", "gender", "weight", "length", "height", "bmi"},
    "vitals": {"bp", "pr", "pulserate", "systolicbp", "diastolicbp"},
    "ecg": {
        "rhythm", "rate", "qwave", "stelevation", "stdepression", "tinversion",
        "lvh", "poorrprogression", "stdep", "peakhr", "peakbp",
    },
    "echocardiography": {"eftte", "regionrwma", "vhd", "mets", "reason to stop"},
    "laboratory": {
        "fbs", "cr", "creatinine", "tg", "ldl", "hdl", "bun", "esr", "hb", "k", "na",
        "wbc", "lymph", "neut", "plt", "t3", "t4", "tsh", "ast", "alt", "alp",
        "insulin", "betablocker", "statin",
    },
}


def normalize_column_name(name: Any) -> str:
    """Trim and collapse whitespace while preserving meaningful punctuation/case."""
    return re.sub(r"\s+", " ", str(name)).strip()


def normalized_key(name: Any) -> str:
    """A comparison-only key; original normalized headers remain unchanged."""
    return re.sub(r"[^a-z0-9]", "", normalize_column_name(name).casefold())


def normalize_frame_columns(frame: pd.DataFrame) -> pd.DataFrame:
    normalized = [normalize_column_name(column) for column in frame.columns]
    keys = [normalized_key(column) for column in normalized]
    duplicates = sorted({key for key in keys if keys.count(key) > 1})
    if duplicates:
        raise ValueError(
            "Column names collide after whitespace/case/punctuation normalization: "
            + ", ".join(duplicates)
        )
    result = frame.copy()
    result.columns = normalized
    return result


def find_column(columns: list[str] | pd.Index, requested: str) -> str | None:
    wanted = normalized_key(requested)
    return next((str(column) for column in columns if normalized_key(column) == wanted), None)


def to_json_value(value: Any) -> Any:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return float(value)
    if isinstance(value, (np.bool_, bool)):
        return bool(value)
    if pd.isna(value):
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def feature_group(name: str) -> str:
    key = normalized_key(name)
    for group, known in GROUP_KEYS.items():
        if key in {normalized_key(item) for item in known}:
            return group
    # Most source fields are symptoms/examination rather than measurements.
    return "clinical"


def infer_feature_schema(frame: pd.DataFrame, feature_columns: list[str]) -> dict[str, Any]:
    """Describe only columns present in the inspected source; no fields are invented."""
    fields: list[dict[str, Any]] = []
    for name in feature_columns:
        series = frame[name]
        non_missing = series.dropna()
        numeric = pd.api.types.is_numeric_dtype(series.dtype)
        if not numeric and len(non_missing):
            converted = pd.to_numeric(non_missing, errors="coerce")
            numeric = float(converted.notna().mean()) >= 0.98
            if numeric:
                series = pd.to_numeric(series, errors="coerce")
                non_missing = series.dropna()

        key = normalized_key(name)
        if numeric and key in NUMERIC_CODED_CATEGORIES and non_missing.nunique(dropna=True) <= 12:
            numeric = False
        field: dict[str, Any] = {
            "name": name,
            "label": name,
            "group": feature_group(name),
            "description": DESCRIPTION_BY_KEY.get(key, "Field as recorded in the dataset; meaning and coding should be checked against the source data dictionary."),
            "type": "numeric" if numeric else "categorical",
            "unit": UNIT_BY_KEY.get(key),
            "missing_supported": True,
            "missing_count": int(series.isna().sum()),
            "observed_range": None,
            "options": [],
            "demo_value": None,
        }
        if numeric:
            numeric_values = pd.to_numeric(non_missing, errors="coerce").dropna()
            if len(numeric_values):
                field["observed_range"] = {
                    "min": float(numeric_values.min()),
                    "max": float(numeric_values.max()),
                }
                field["demo_value"] = float(numeric_values.median())
        else:
            values = [to_json_value(value) for value in non_missing.tolist()]
            unique_values: list[Any] = []
            seen: set[tuple[str, str]] = set()
            for value in values:
                key_value = (type(value).__name__, repr(value))
                if key_value not in seen:
                    unique_values.append(value)
                    seen.add(key_value)
            field["options"] = unique_values
            if len(non_missing):
                modes = non_missing.mode(dropna=True)
                if len(modes):
                    field["demo_value"] = to_json_value(modes.iloc[0])
        fields.append(field)

    return {
        "available": bool(fields),
        "source": "Inspected local dataset; field metadata are generated at audit/training time.",
        "missing_values_supported": True,
        "fields": fields,
    }


def leakage_audit_columns(feature_columns: list[str]) -> dict[str, Any]:
    remaining = [column for column in feature_columns if normalized_key(column) in FORBIDDEN_PREDICTOR_KEYS]
    outcome_aliases = [column for column in feature_columns if normalized_key(column) in DOCUMENTED_OUTCOME_ALIAS_KEYS]
    return {
        "required_forbidden_columns": sorted(FORBIDDEN_PREDICTOR_KEYS),
        "forbidden_columns_remaining": remaining,
        "documented_outcome_aliases_remaining": outcome_aliases,
        "passed": not remaining and not outcome_aliases,
        "final_input_columns": list(feature_columns),
    }
