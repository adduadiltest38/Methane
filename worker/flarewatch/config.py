"""Runtime configuration and classifier/change-detection thresholds.

Every tunable number lives here so that it can be documented on the About page
and overridden through environment variables (e.g. ``DBSCAN_EPS_M=400``).
"""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

NRT_SOURCES = ("VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT")
SP_SOURCES = ("VIIRS_SNPP_SP",)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    # --- connections -------------------------------------------------------
    firms_map_key: str = ""
    database_url: str = "postgresql://flarewatch:flarewatch@localhost:5432/flarewatch"
    firms_base_url: str = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"

    # --- region & sources ----------------------------------------------------
    # west, south, east, north
    region_bbox: Annotated[tuple[float, float, float, float], NoDecode] = (34.0, 12.0, 63.0, 38.0)
    nrt_sources: Annotated[tuple[str, ...], NoDecode] = NRT_SOURCES
    sp_sources: Annotated[tuple[str, ...], NoDecode] = SP_SOURCES
    nrt_day_range: int = 2
    # FIRMS caps the number of days per area request; backfill is chunked by this.
    firms_max_day_range: int = 5
    http_retries: int = 3
    http_timeout_s: float = 120.0
    # pause between FIRMS calls to stay well under the per-key transaction limit
    request_pause_s: float = 1.0

    # --- clustering ----------------------------------------------------------
    dbscan_eps_m: float = 500.0
    dbscan_min_samples: int = 3
    site_match_radius_m: float = 750.0
    cluster_window_days: int = 90
    cluster_confidences: Annotated[tuple[str, ...], NoDecode] = ("n", "h")

    # --- classification (rule-based v1) ------------------------------------
    classify_window_days: int = 90
    flare_min_persistence: float = 0.2
    industrial_min_persistence: float = 0.3
    industrial_min_span_days: int = 30
    transient_max_span_days: int = 7
    transient_max_persistence: float = 0.1
    # confidence = W_EVIDENCE*evidence + W_OBS*min(1, n_obs/CONF_OBS_SATURATION) + W_REF*ref_match
    conf_w_evidence: float = 0.4
    conf_w_obs: float = 0.3
    conf_w_ref: float = 0.3
    conf_obs_saturation: int = 30
    conf_persistence_saturation: float = 0.5

    # --- activity changes ----------------------------------------------------
    change_min_history_days: int = 30
    change_baseline_days: int = 90
    change_recent_days: int = 7
    change_z_threshold: float = 2.5
    change_cooldown_days: int = 7
    change_min_std_mw: float = 1.0
    inactive_after_days: int = 30
    new_site_window_days: int = 30
    new_site_min_observed_days: int = 5
    new_site_min_persistence: float = 0.3

    @field_validator("region_bbox", mode="before")
    @classmethod
    def _parse_bbox(cls, v: object) -> object:
        if isinstance(v, str):
            parts = tuple(float(p) for p in v.split(","))
            if len(parts) != 4:
                raise ValueError("REGION_BBOX must be 'west,south,east,north'")
            return parts
        return v

    @field_validator("nrt_sources", "sp_sources", "cluster_confidences", mode="before")
    @classmethod
    def _parse_csv_list(cls, v: object) -> object:
        if isinstance(v, str):
            return tuple(p.strip() for p in v.split(",") if p.strip())
        return v

    @field_validator("region_bbox")
    @classmethod
    def _check_bbox(cls, v: tuple[float, float, float, float]) -> tuple[float, ...]:
        west, south, east, north = v
        if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
            raise ValueError(f"invalid bbox {v}")
        return v

    @property
    def bbox_str(self) -> str:
        return ",".join(f"{c:g}" for c in self.region_bbox)

    def thresholds(self) -> dict[str, float]:
        """Thresholds exposed to the web app / About page."""
        keys = [k for k in type(self).model_fields if k.startswith(("flare_", "industrial_",
                "transient_", "conf_", "change_", "inactive_", "new_site_", "dbscan_",
                "site_match"))]
        return {k: getattr(self, k) for k in keys}


@lru_cache
def get_settings() -> Settings:
    return Settings()
