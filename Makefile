# Local development helpers
DATABASE_URL ?= postgresql://flarewatch:flarewatch@localhost:5432/flarewatch
export DATABASE_URL

.PHONY: db-up db-down db-reset migrate worker-install test lint web-install web-dev web-build banned-words seed

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

test:
	cd worker && pytest

lint:
	cd worker && ruff check . && ruff format --check .
	cd web && npm run lint

seed:             ## Load synthetic demo data (no API key needed)
	cd worker && python -m flarewatch.cli seed-demo

web-install:
	cd web && npm ci

web-dev:
	cd web && npm run dev

web-build:
	cd web && npm run build

banned-words:
	./ci/check_banned_words.sh
