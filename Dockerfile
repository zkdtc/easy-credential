FROM node:22-alpine AS frontend

WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
ARG VITE_API_URL=""
ARG VITE_APP_BASE="/app"
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_APP_BASE=${VITE_APP_BASE}
RUN npm run build

FROM python:3.12-slim AS app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    FRONTEND_DIST_DIR=/app/frontend/dist \
    MEDIA_ROOT=/app/media \
    PORT=8008

WORKDIR /app/backend

COPY backend/pyproject.toml ./
COPY backend/app ./app
RUN pip install --upgrade pip && pip install -e .

COPY backend/ ./
COPY --from=frontend /build/frontend/dist /app/frontend/dist
COPY deploy/start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 8008
CMD ["/app/start.sh"]
