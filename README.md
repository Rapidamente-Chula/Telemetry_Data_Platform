# Telemetry Data Platform

A containerised data platform for EV motor telemetry built on PostgreSQL, Grafana, and Node-RED.

## Architecture

```
EV Controller
    │
    ├── MQTT (ev/telemetry) ──┐
    └── HTTP POST /telemetry ─┤
                              ▼
                         Node-RED :1880
                         (ingestion)
                              │
                              ▼
                         PostgreSQL :5435
                         (telemetry_records)
                              │
                              ▼
                         Grafana :3000
                         (dashboards)
```

## Services

| Service    | Port  | Default credentials |
|------------|-------|---------------------|
| PostgreSQL | 5435  | postgres / strongpassword (DB: ev) |
| Grafana    | 3000  | admin / admin |
| Node-RED   | 1880  | — |

## Prerequisites

- Docker + Docker Compose v2
- pnpm (for running Prisma migrations from host) — `npm install -g pnpm`

## Quick Start

### 1. Configure environment

```bash
cp .env.example .env
# Edit .env if you want to change credentials
```

### 2. Start all services

```bash
# Run from the project root (so docker compose picks up the root .env)
docker compose up -d --build
```

The `--build` flag is required on the first run to build the Node-RED image with the PostgreSQL node.

Check that everything started:

```bash
docker compose ps
```

### 3. Run database migrations

The Prisma migration creates the `telemetry_records` table. Run it once after the database is up.

**Option A – from host (requires pnpm):**

```bash
cd db
pnpm install
pnpm migrate
```

**Option B – from a temporary container:**

```bash
docker run --rm \
  --network infra_telemetry-net \
  -e DATABASE_URL=postgresql://postgres:strongpassword@postgresdb:5432/ev \
  -v $(pwd)/db:/app \
  -w /app \
  node:20-alpine \
  sh -c "npm install -g pnpm && pnpm install && pnpm migrate"
```

### 4. Verify the setup

- **Grafana**: open http://localhost:3000 — the PostgreSQL datasource should already be provisioned under Data Sources.
- **Node-RED**: open http://localhost:1880 — the Telemetry Ingestion flow should be deployed.

## Sending Telemetry Data

### MQTT

Publish a JSON message to topic `ev/telemetry` on `broker.hivemq.com:1883`:

```json
{
  "timestamp": "2026-05-10T10:00:00.000Z",
  "rpm": 1500.0,
  "amp": 25.5,
  "volt": 48.2,
  "trq": 10.3,
  "mode": 1,
  "err": 0,
  "warn": 0,
  "igbtC": 45.1,
  "motC": 60.3,
  "lRegen": 0,
  "lErr": 0,
  "lWarn": 0,
  "lOk": 1,
  "lPump": 1,
  "driveEna": 1
}
```

### HTTP POST

```bash
curl -X POST http://localhost:1880/telemetry \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": "2026-05-10T10:00:00.000Z",
    "rpm": 1500.0,
    "amp": 25.5,
    "volt": 48.2,
    "trq": 10.3,
    "mode": 1,
    "err": 0,
    "warn": 0,
    "igbtC": 45.1,
    "motC": 60.3,
    "lRegen": 0,
    "lErr": 0,
    "lWarn": 0,
    "lOk": 1,
    "lPump": 1,
    "driveEna": 1
  }'
```

## Telemetry Schema

Table: `telemetry_records`

| Column     | Type    | Description |
|------------|---------|-------------|
| id         | int     | Auto-increment PK |
| timestamp  | datetime | Measurement time from the controller |
| rpm        | float   | Motor RPM |
| amp        | float   | Current (A) |
| volt       | float   | Voltage (V) |
| trq        | float   | Torque (Nm) |
| mode       | int     | Drive mode |
| err        | int     | Error code |
| warn       | int     | Warning code |
| igbtC      | float   | IGBT temperature (°C) |
| motC       | float   | Motor temperature (°C) |
| lRegen     | int     | Regen flag (0/1) |
| lErr       | int     | Error flag (0/1) |
| lWarn      | int     | Warning flag (0/1) |
| lOk        | int     | OK flag (0/1) |
| lPump      | int     | Pump flag (0/1) |
| driveEna   | int     | Drive enable flag (0/1) |
| createdAt  | datetime | Row insert time |

## Grafana Dashboards

The PostgreSQL datasource is auto-provisioned on startup (`infra/monitoring/provisioning/datasources/postgres.yaml`).

To query telemetry in a panel, use the datasource **PostgreSQL** with queries like:

```sql
SELECT
  timestamp AS "time",
  rpm, amp, volt, trq
FROM telemetry_records
WHERE $__timeFilter(timestamp)
ORDER BY timestamp ASC
```

## Node-RED Flow

The ingestion flow (`services/node-red/flows.json`) handles two inputs:

- **MQTT In** — subscribes to `ev/telemetry` on the HiveMQ public broker
- **HTTP In** — accepts `POST /telemetry` with a JSON body

Both paths validate the payload, build the SQL parameter array, and insert a row into `telemetry_records`.

To switch to a private MQTT broker, open Node-RED at http://localhost:1880, edit the **MQTT Broker** config node, and redeploy.

## Stopping Services

```bash
docker compose down        # stop containers, keep volumes
docker compose down -v     # stop and delete all data
```

## Directory Structure

```
.
├── db/
│   ├── package.json                # Prisma 7 dependencies
│   ├── prisma.config.ts            # Prisma 7 datasource config
│   └── prisma/
│       ├── schema.prisma           # Data model (no datasource block in v7)
│       └── migrations/             # SQL migration history
├── infra/
│   ├── docker-compose.yaml         # Service definitions
│   └── monitoring/
│       └── provisioning/
│           └── datasources/
│               └── postgres.yaml   # Grafana auto-provision
└── services/
    └── node-red/
        ├── Dockerfile              # Adds node-red-contrib-postgresql
        └── flows.json              # Telemetry ingestion flow
```
