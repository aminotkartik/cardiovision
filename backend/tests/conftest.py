"""Shared isolated training fixture; never written to repository artifacts."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))


def _synthetic_training_frame():
    n = 32
    index = np.arange(n)
    return pd.DataFrame({
        "Age": np.linspace(38, 78, n),
        "Sex": np.where(index % 2 == 0, "Female", "Male"),
        "BP": 105 + (index % 14) * 4,
        "Cath": np.where(index % 2 == 0, "CAD", "Normal"),
        "LAD": (index % 2).astype(int),
        "LCX": ((index // 2) % 2).astype(int),
        "RCA": ((index // 4) % 2).astype(int),
    })


@pytest.fixture(scope="session")
def training_frame():
    frame = _synthetic_training_frame()
    frame.loc[1, "Age"] = np.nan
    return frame


@pytest.fixture(scope="session")
def trained_artifacts(tmp_path_factory, training_frame):
    from training.train_models import train_from_frame

    artifacts = tmp_path_factory.mktemp("trained-models")
    train_from_frame(
        training_frame,
        artifacts,
        positive_labels={"lad": "1", "lcx": "1", "rca": "1"},
        random_seed=7,
        test_size=0.25,
        repeats=1,
    )
    return artifacts
