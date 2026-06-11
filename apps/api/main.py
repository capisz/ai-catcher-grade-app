from catcher_intel.api_app import app
from catcher_intel.live_data import router as live_router

# Live MLB Stats API layer: /live/schedule, /live/games/{pk}/catchers,
# /live/games/{pk}/pitches, /live/players/{id}/gamelog, /live/cache-status
app.include_router(live_router)
