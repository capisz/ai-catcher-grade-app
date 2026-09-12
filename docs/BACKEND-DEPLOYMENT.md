# Backend operation and deployment

## Local setup

Create `.venv` and install `pip install -e .` using that environment. Copy
`.env.example` to `.env`; Python now loads this file without overriding exported
environment variables. `pnpm dev:api` uses `.venv` on port 8000.

This checkout has an isolated Postgres 18 cluster in `data/postgres`, on loopback
port 5433, with the example local database credentials. Start it after a reboot:

```sh
/Library/PostgreSQL/18/bin/pg_ctl -D data/postgres -l data/postgres.log -o '-h 127.0.0.1 -p 5433 -k /private/tmp' start
pnpm dev:api
```

In another terminal, run `pnpm dev:web`. Open http://localhost:3000.
The database currently contains 1,600 synthetic pitches for four catchers in 2025.
Live game mode separately uses public MLB data. `apps/web/.env.local` sets
`BACKEND_DATA_MODE=demo` so historical product screens disclose demo data.

The demo seed builds model artifacts, identities and all scouting summaries:

```sh
OMP_NUM_THREADS=2 .venv/bin/python services/modeling/seed_demo.py
```

**The seed replaces pitch/model tables. Run it only against a disposable demo
database, never against an ingested production dataset.**

## Deployment configuration

Build the backend from the repository root using `Dockerfile.api`. It includes
the OpenMP runtime required by XGBoost, source packages, API and SQL schema.
The container accepts the host's `PORT` and listens on all container interfaces.
The container recipe has not yet been built or deployed.

Set `DATABASE_URL` to the deployment's Postgres connection string, including
the provider's required TLS settings. Both `postgres://` and `postgresql://`
are normalized to the installed psycopg 3 driver. Never use the local example
password for a hosted database. Set `API_ORIGIN` to the frontend origin.

The API currently applies its idempotent schema at startup, so its database
role needs DDL access. Back up existing databases before releasing schema changes.
`/health` checks a live database connection and returns 503 when it fails.

Provision scored data using the README ingestion pipeline. For Game mode,
provide the matching trusted model artifact on a persistent mount and set
`CATCHER_INTEL_MODEL_PATH`; artifacts and local data are excluded from the image.
Do not load model files from untrusted sources. A healthy empty database alone
does not provide usable scouting results.

Set `API_BASE_URL` in the frontend hosting environment to the reachable backend
URL. Next.js reads frontend local settings from `apps/web/.env.local`, not the
repository root `.env`. Keep `BACKEND_DATA_MODE=demo` only for a synthetic-data
deployment. Confirm health, metadata, populated catcher/leaderboard responses,
comparison, and recommendation via `/api/backend` after deployment.

The optional analyst needs `ANTHROPIC_API_KEY` in the frontend environment.
It remains disabled locally. Its configured model and authenticated streaming
request must be verified with the intended Anthropic account before release.

No hosting provider, production database, or API credentials were configured by
this local setup. A successful local build does not verify a hosted deployment.
