# Local development helpers
DATABASE_URL ?= postgresql://flarewatch:flarewatch@localhost:5432/flarewatch
export DATABASE_URL

.PHONY: db-up db-down db-reset migrate worker-install test lint web-install web-dev web-build banned-words seed ingest backfill

db-up:            ## Start PostGIS in docker and apply migrations
	docker compose up -d --wait db
	./db/migrate.sh

db-down:
	docker compose down

db-reset:         ## Drop the volume and start fresh
	docker compose down -v
	$(MAKE) db-up

migrate:
	./db/migrate.sh

worker-install:
	cd worker && pip install -e ".[dev]"

test:            ## Worker tests (DB tests need TEST_DATABASE_URL pointing at a throwaway DB)
	cd worker && pytest

ingest:           ## Fetch latest FIRMS NRT data and process (needs FIRMS_MAP_KEY)
	cd worker && python -m flarewatch.cli run

backfill:         ## Pull 90 days of Standard Processing data (needs FIRMS_MAP_KEY)
	cd worker && python -m flarewatch.cli backfill --days 90

lint:
	cd worker && ruff check . && ruff format --check .
	cd web && npm run lint

seed:             ## Load synthetic demo data (no API key needed)
	cd worker && python -m flarewatch.cli seed-demo

web-install:
	cd web && npm ci

web-dev:          ## Web app on http://localhost:3000 (uses DATABASE_URL when no read-only URL is set)
	cd web && npm run dev

web-build:
	cd web && npm run build

banned-words:
	./ci/check_banned_words.sh
