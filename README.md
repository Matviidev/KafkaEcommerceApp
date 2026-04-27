# E-Commerce Order Processing Platform

Event-driven microservices system for e-commerce order processing. Orders flow from a React frontend through Kafka-connected services for payment, delivery, search indexing, and analytics.

## Architecture

```
React Frontend (port 80)
      │
      ▼
Order Service ──(orders)──▶ Payment Service ──(payments)──▶ Delivery Service
      │                           │                               │
      │                     (orders.DLQ)              (order.status.updated)
      │◀──────────────────────────────────────────────────────────┘
      │
      └──── all topics ──▶ Search Service ──▶ Elasticsearch ◀── Kibana
                                │
                         Analytics Service
                                │
                       Prometheus + Grafana
```

### Kafka Topics

| Topic                  | Partitions | Producer          | Consumer(s)                          |
|------------------------|------------|-------------------|--------------------------------------|
| `orders`               | 3          | Order Service     | Payment Service, Analytics, Search   |
| `payments`             | 1          | Payment Service   | Delivery Service, Analytics, Search  |
| `order.status.updated` | 1          | Delivery Service  | Order Service, Search                |
| `orders.DLQ`           | 1          | Payment Service   | Search Service                       |
| `order-stats`          | 1          | Analytics Service | —                                    |

### Services

| Service            | Port | Description                                                     |
|--------------------|------|-----------------------------------------------------------------|
| order-service      | 3001 | NestJS REST API + SQLite + Kafka producer/consumer + SSE        |
| payment-service    | 3002 | 80% success / 20% fail, 3 retries, DLQ on failure              |
| delivery-service   | 3003 | PREPARING → SHIPPED → DELIVERED every 5s                       |
| analytics-service  | 3004 | 60s sliding window aggregation, `/stats` REST endpoint         |
| search-service     | 3005 | Elasticsearch upsert from all topics, full-text search API      |
| frontend           | 80   | React: order form, live dashboard, analytics charts, search     |
| kafka              | 9092 | Apache Kafka (internal); 9093 for host access                   |
| kafka-ui           | 8080 | Kafka UI — inspect topics and consumer groups                   |
| elasticsearch      | 9200 | Document store for order search                                 |
| kibana             | 5601 | Kibana — explore ES indices                                     |
| prometheus         | 9090 | Metrics scraping from all services                              |
| grafana            | 3000 | Dashboards (admin / admin)                                      |

## Quick Start

```bash
docker compose up --build
```

That's it. All services, infrastructure, and the frontend start together. First boot takes longer while images are pulled and services are built.

Wait for this log line before using the UI:
```
order-service-1  | [OrdersModule] Kafka producer connected, topics ensured
```

Open **http://localhost** in your browser.

## Frontend

| Tab        | What it does                                                                         |
|------------|--------------------------------------------------------------------------------------|
| Place Order | Submit an order with custom products, quantities, and prices                        |
| Orders     | Live table of all orders — status updates arrive in real time via SSE                |
| Analytics  | Orders/min line chart, payment success pie chart, 4 stat counters — polls every 10s |
| Search     | Full-text search with status filter, date range, pagination, keyword highlighting    |

## Order Lifecycle

```
Place order → PENDING
    └─▶ Payment Service (1–3s, 3 retries)
            ├─▶ SUCCESS → PAID → PREPARING → SHIPPED → DELIVERED  (15s total)
            └─▶ FAILED  → payment_failed (sent to orders.DLQ)
```

## Monitoring

- **Kafka UI** — http://localhost:8080 — inspect topics, messages, consumer group lag
- **Kibana** — http://localhost:5601 — query the `orders` Elasticsearch index
- **Prometheus** — http://localhost:9090 — raw metrics
- **Grafana** — http://localhost:3000 (admin / admin) — pre-provisioned dashboard with:
  - Kafka message throughput (produced / consumed per topic)
  - Payment success vs failure rate
  - Payment success rate gauge
  - Average order processing duration (p50 / p95)
  - Orders per minute

### Available Metrics (all services expose `/metrics`)

| Metric                              | Type      | Description                             |
|-------------------------------------|-----------|-----------------------------------------|
| `kafka_messages_produced_total`     | Counter   | Messages published, labelled by topic   |
| `kafka_messages_consumed_total`     | Counter   | Messages consumed, labelled by topic    |
| `payment_success_total`             | Counter   | Successful payments                     |
| `payment_failure_total`             | Counter   | Failed payments (after 3 retries)       |
| `order_processing_duration_seconds` | Histogram | End-to-end payment processing time      |
| `analytics_orders_per_minute`       | Gauge     | Orders in the last 60s                  |
| `analytics_payment_success_rate`    | Gauge     | Success rate in the last 60s            |
| `analytics_avg_processing_ms`       | Gauge     | Average ms from order → payment         |

## Local Development

Prerequisites: Node.js 20+, pnpm 10+, Docker.

```bash
# Start only infrastructure
docker compose up zookeeper kafka elasticsearch -d

# Install dependencies
pnpm install

# Run a service in watch mode (example)
pnpm --filter @ecommerce/order-service dev
pnpm --filter @ecommerce/payment-service dev
pnpm --filter @ecommerce/frontend dev   # http://localhost:5173
```

Copy `.env.example` to `.env` — defaults point to `localhost` so local services connect to Docker infra.

```bash
cp .env.example .env
```

### Typecheck all packages

```bash
pnpm typecheck
```

### Build all packages

```bash
pnpm build
```

## Project Structure

```
.
├── apps/
│   └── frontend/           # React + Vite (TypeScript)
├── services/
│   ├── order-service/      # NestJS — REST API, SQLite, SSE, Kafka
│   ├── payment-service/    # Express — Kafka consumer/producer
│   ├── delivery-service/   # Express — Kafka consumer/producer
│   ├── analytics-service/  # Express — sliding window, /stats
│   └── search-service/     # Express — Elasticsearch upsert + search API
├── packages/
│   └── shared/             # Shared TypeScript types and Kafka topic constants
├── infrastructure/
│   ├── prometheus/         # prometheus.yml scrape config
│   └── grafana/            # Auto-provisioned datasource + dashboard
├── docker-compose.yml
└── .env.example
```

## Tech Stack

- **Runtime** — Node.js 20, TypeScript 5
- **Order Service** — NestJS 11, better-sqlite3, class-validator
- **Other services** — Express 4
- **Kafka client** — kafkajs 2
- **ES client** — @elastic/elasticsearch 8
- **Metrics** — prom-client 15
- **Frontend** — React 18, Vite 5, Recharts 2, Axios
- **Infrastructure** — Docker Compose v2, Confluent Kafka 7.6, Elasticsearch 8.13, Grafana
- **Monorepo** — pnpm workspaces + Turborepo
