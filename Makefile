.PHONY: dev-server dev-web test build up down logs

dev-server:
	cd server && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

dev-web:
	cd web && npm run dev

test:
	cd server && python -m pytest
	cd web && npm run build

build:
	docker compose build

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f --tail=150
