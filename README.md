# Hybrid Systems Modernization

Bridges a legacy Django/PostgreSQL monolith with a new Node.js/MongoDB microservice. Includes a real-time Next.js dashboard, a background sync pipeline, Docker Compose for local dev, Kubernetes manifests for production, and a GitHub Actions CI/CD pipeline.

## Stack

- Django — legacy REST API, PostgreSQL
- Node.js (TypeScript) — new microservice, MongoDB, Socket.io, sync worker
- Next.js — real-time monitoring dashboard
- Redis — shared pub/sub layer
- Docker Compose / Kubernetes — orchestration

## Architecture

```
Browser (Next.js)
      ↕ Socket.io
Node.js :4000
  ├── MongoDB
  ├── Redis
  └── Sync Worker ──polls──▶ Django :8000 ──▶ PostgreSQL
```

The sync worker runs on a configurable interval, fetches unsynced orders from Django, upserts them into MongoDB, then marks them synced. The Node.js service broadcasts live metrics to the dashboard every 5 seconds via Socket.io.

## Getting Started

```bash
docker compose up --build
```

| Service     | URL                    |
|-------------|------------------------|
| Dashboard   | http://localhost:3000  |
| Node.js API | http://localhost:4000  |
| Django API  | http://localhost:8000  |

## Environment Variables

Copy `node-service/.env.example` to `node-service/.env`. Key variables:

| Variable           | Default                               |
|--------------------|---------------------------------------|
| `MONGO_URI`        | `mongodb://localhost:27017/orders_db` |
| `REDIS_URL`        | `redis://localhost:6379/0`            |
| `DJANGO_URL`       | `http://localhost:8000`               |
| `SYNC_INTERVAL_MS` | `10000`                               |
| `SYNC_BATCH_SIZE`  | `50`                                  |

## Migration Strategy (Zero Downtime)

The sync pipeline uses a shadow-write approach:

1. Django remains the source of truth, writing only to PostgreSQL.
2. The Node.js sync worker polls `/api/v1/sync/unsynced/` and bulk-upserts records into MongoDB using the order's `external_id` UUID as the Mongo `_id` — so the same identifier works across both databases.
3. A `SyncCheckpoint` model tracks the high-water mark PK so the worker never re-scans the full table on restart.
4. Once sync lag reaches zero and consistency checks pass, traffic can be cut over to MongoDB with Django deprecated to read-only.

The upsert is idempotent — if the worker crashes mid-batch, re-running produces the same result.

## Real-Time Dashboard

The dashboard connects to the Node.js Socket.io server and receives:

- `metrics:snapshot` — full state on connect
- `metrics:update` — pushed every 5 seconds
- `sync:progress` — emitted after each sync batch
- `order:statusChanged` — emitted on order status updates

Connection drops are handled with exponential back-off (up to 5 retries, capped at 15s). After all retries fail, the UI shows an error banner with a manual reconnect button. The `ConnectionBanner` component reflects all intermediate states (connecting, reconnecting, disconnected, error).

## CI/CD Pipeline

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push:

1. `lint-django` — flake8 + black format check
2. `lint-node` — ESLint + `tsc --noEmit`
3. `lint-dashboard` — ESLint + `next build`
4. `docker-build` — builds all three images to validate Dockerfiles (no push)
5. `docker-push` — builds and pushes to Amazon ECR (main branch only, tagged with commit SHA + `latest`)

Layer caching via `type=gha` keeps repeat builds fast.

## Kubernetes Deployment

Manifests are in `infra/k8s/`. To deploy:

```bash
kubectl create namespace hybrid-systems
kubectl apply -f infra/k8s/secrets.yaml   # fill from secrets.yaml.template first
kubectl apply -f infra/k8s/deployments.yaml
```

The manifests include:
- Deployments for Django (2 replicas), Node.js (3 replicas), Dashboard (2 replicas)
- `RollingUpdate` strategy with `maxUnavailable: 0` for zero-downtime deploys
- Readiness + liveness probes on `/health` for each service
- HPA on Node.js (3–10 pods, CPU > 70%) and Django (2–6 pods)
- ALB Ingress with WebSocket idle timeout set to 3600s for Socket.io

## AWS Infrastructure

**ECS vs EKS:** EKS is the better fit here. The Socket.io requirement needs sticky sessions or a Redis adapter across replicas — EKS handles this more cleanly with `sessionAffinity` and the `@socket.io/redis-adapter`. The sync worker also maps naturally to a Kubernetes CronJob, and HPA with custom metrics (e.g., sync queue depth via KEDA) gives more flexibility than ECS task scaling.

**Databases:**
- PostgreSQL → AWS RDS (Multi-AZ, `db.t3.medium` for dev, `db.r6g.large` for prod, automated snapshots + point-in-time recovery)
- MongoDB → MongoDB Atlas over DocumentDB. DocumentDB doesn't support Change Streams or the full aggregation pipeline (`$group` is used in `metrics.ts`). Atlas also has better local dev parity via Docker.

**Horizontal Scaling:**
When CPU on the Node.js pods exceeds 70%, HPA scales from 3 to up to 10 replicas. Because multiple Node.js instances share Socket.io connections, the Redis adapter (`@socket.io/redis-adapter`) is required so events broadcast across all pods. If pod count exceeds node capacity, the Cluster Autoscaler adds EC2 nodes to the group. RDS read replicas absorb analytics queries so write latency stays stable.

## API Reference

**Django** (`localhost:8000/api/v1/`)

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/orders/` | List / create orders |
| GET/PATCH/DELETE | `/orders/<id>/` | Order detail |
| GET | `/sync/unsynced/` | Fetch unsynced batch |
| POST | `/sync/mark-synced/` | Mark batch as synced |
| GET | `/sync/status/` | Sync pipeline stats |

**Node.js** (`localhost:4000/api/v1/`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/orders/` | List orders from MongoDB |
| GET | `/orders/:id` | Get order |
| PATCH | `/orders/:id/status` | Update status + emit event |
| GET | `/metrics` | Current metrics snapshot |
