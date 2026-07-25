# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS web-builder
WORKDIR /build/web
COPY web/package.json web/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --prefer-offline --no-audit
COPY web/ ./
RUN npm run build

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HARDWARE_PI_HOST=0.0.0.0 \
    HARDWARE_PI_PORT=8000 \
    HARDWARE_PI_DATA_DIR=/data

WORKDIR /app
COPY server/requirements.txt /app/server/requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r /app/server/requirements.txt

COPY server/ /app/server/
COPY shared/ /app/shared/
COPY --from=web-builder /build/web/dist /app/web/dist

WORKDIR /app/server
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
