# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS web
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM rust:1.98-bookworm AS rust
WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY migrations ./migrations
RUN cargo build --locked --release

FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 app && useradd --uid 10001 --gid app --no-create-home app
WORKDIR /app
COPY --from=rust /build/target/release/daily-quest /usr/local/bin/daily-quest
COPY --from=web /build/frontend/dist ./frontend/dist
USER 10001:10001
ENV BIND_ADDRESS=0.0.0.0:3000 COOKIE_SECURE=true REGISTRATION_ENABLED=false
EXPOSE 3000
ENTRYPOINT ["daily-quest"]
