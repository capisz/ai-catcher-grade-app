from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware

from catcher_intel.api_models import (
    AppMetadataResponse,
    CatcherComparisonResponse,
    CatcherDetailResponse,
    CatcherReportOptionsResponse,
    CatcherReportRequest,
    CatchersResponse,
    CountsResponse,
    LeaderboardResponse,
    LocationSummaryResponse,
    PairingsResponse,
    PitchTypesResponse,
    RecommendationResponse,
)
from catcher_intel.api_service import IntelService
from catcher_intel.config import get_settings
from catcher_intel.db import ensure_schema

settings = get_settings()
ensure_schema(settings.database_url)
service = IntelService()

app = FastAPI(
    title="Catcher Intel API",
    version="0.1.0",
    description="Public-data catcher scouting API for game-calling and receiving evaluation.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.api_origin, "http://127.0.0.1:3000", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/app/metadata", response_model=AppMetadataResponse)
def app_metadata(
    season: Optional[int] = Query(default=None, ge=2008),
) -> AppMetadataResponse:
    return service.get_app_metadata(season=season)


@app.get("/catchers", response_model=CatchersResponse)
def catchers(
    season: Optional[int] = Query(default=None, ge=2008),
    team: Optional[str] = Query(default=None),
) -> CatchersResponse:
    return service.get_catchers(season=season, team=team)


@app.get("/catchers/leaderboard", response_model=LeaderboardResponse)
def catchers_leaderboard(
    min_pitches: int = Query(default=50, ge=1),
    season: Optional[int] = Query(default=None, ge=2008),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    team: Optional[str] = Query(default=None),
) -> LeaderboardResponse:
    return service.get_leaderboard(
        min_pitches=min_pitches,
        season=season,
        date_from=date_from,
        date_to=date_to,
        team=team,
    )


@app.get("/catchers/compare", response_model=CatcherComparisonResponse)
def catcher_compare(
    catcher_a: int = Query(..., ge=1),
    catcher_b: int = Query(..., ge=1),
    min_pitches: int = Query(default=50, ge=1),
    season: Optional[int] = Query(default=None, ge=2008),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    team: Optional[str] = Query(default=None),
) -> CatcherComparisonResponse:
    try:
        return service.get_catcher_comparison(
            catcher_a_id=catcher_a,
            catcher_b_id=catcher_b,
            season=season,
            min_pitches=min_pitches,
            date_from=date_from,
            date_to=date_to,
            team=team,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/catchers/{catcher_id}", response_model=CatcherDetailResponse)
def catcher_detail(
    catcher_id: int,
    season: Optional[int] = Query(default=None, ge=2008),
) -> CatcherDetailResponse:
    try:
        return service.get_catcher_detail(
            catcher_id=catcher_id,
            season=season,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/catchers/{catcher_id}/report/options", response_model=CatcherReportOptionsResponse)
def catcher_report_options(
    catcher_id: int,
    season: Optional[int] = Query(default=None, ge=2008),
) -> CatcherReportOptionsResponse:
    try:
        return service.get_catcher_report_options(catcher_id=catcher_id, season=season)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/catchers/{catcher_id}/report")
def catcher_report(
    catcher_id: int,
    payload: CatcherReportRequest,
) -> Response:
    try:
        report = service.generate_catcher_report(catcher_id=catcher_id, request=payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return Response(
        content=report.content,
        media_type=report.media_type,
        headers={"Content-Disposition": f'attachment; filename="{report.filename}"'},
    )


@app.get("/catchers/{catcher_id}/pairings", response_model=PairingsResponse)
def catcher_pairings(
    catcher_id: int,
    season: Optional[int] = Query(default=None, ge=2008),
    limit: int = Query(default=10, ge=1, le=50),
) -> PairingsResponse:
    return service.get_catcher_pairings(catcher_id=catcher_id, season=season, limit=limit)


@app.get("/catchers/{catcher_id}/counts", response_model=CountsResponse)
def catcher_counts(
    catcher_id: int,
    season: Optional[int] = Query(default=None, ge=2008),
) -> CountsResponse:
    return service.get_catcher_counts(catcher_id=catcher_id, season=season)


@app.get("/catchers/{catcher_id}/pitch-types", response_model=PitchTypesResponse)
def catcher_pitch_types(
    catcher_id: int,
    season: Optional[int] = Query(default=None, ge=2008),
) -> PitchTypesResponse:
    return service.get_catcher_pitch_types(catcher_id=catcher_id, season=season)


@app.get("/catchers/{catcher_id}/location-summary", response_model=LocationSummaryResponse)
def catcher_location_summary(
    catcher_id: int,
    season: Optional[int] = Query(default=None, ge=2008),
) -> LocationSummaryResponse:
    return service.get_catcher_location_summary(catcher_id=catcher_id, season=season)


@app.get("/atbat/recommendation", response_model=RecommendationResponse)
def atbat_recommendation(
    pitcher_id: int = Query(..., ge=1),
    stand: str = Query(..., pattern="^[LRS]$"),
    p_throws: str = Query(..., pattern="^[LR]$"),
    balls: int = Query(default=0, ge=0, le=3),
    strikes: int = Query(default=0, ge=0, le=2),
    outs_when_up: int = Query(default=0, ge=0, le=2),
    base_state: str = Query(default="000", pattern="^[01]{3}$"),
    catcher_id: Optional[int] = Query(default=None, ge=1),
    batter_id: Optional[int] = Query(default=None, ge=1),
    prev_pitch_type_1: Optional[str] = Query(default=None),
    prev_pitch_type_2: Optional[str] = Query(default=None),
) -> RecommendationResponse:
    try:
        return service.get_atbat_recommendation(
            pitcher_id=pitcher_id,
            stand=stand,
            p_throws=p_throws,
            balls=balls,
            strikes=strikes,
            outs_when_up=outs_when_up,
            base_state=base_state,
            catcher_id=catcher_id,
            batter_id=batter_id,
            prev_pitch_type_1=prev_pitch_type_1,
            prev_pitch_type_2=prev_pitch_type_2,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
