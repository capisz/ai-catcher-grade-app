from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional
from pathlib import Path

from dotenv import load_dotenv

# Resolve from the project, independent of the process working directory.
# Deployment environment variables always take precedence over local values.
load_dotenv(Path(__file__).resolve().parents[5] / ".env", override=False)


@dataclass(frozen=True)
class Settings:
    database_url: str
    model_path: str
    api_origin: str


def get_settings(database_url: Optional[str] = None) -> Settings:
    return Settings(
        database_url=database_url or os.getenv("DATABASE_URL", "sqlite:///data/catcher_intel.db"),
        model_path=os.getenv("CATCHER_INTEL_MODEL_PATH", "artifacts/run_value_model.joblib"),
        api_origin=os.getenv("API_ORIGIN", "http://localhost:3000"),
    )
