# Design Document: E-Commerce Order Processing Platform

## 1. Overview

An event-driven system that takes an order from a React UI through payment, delivery, search indexing and analytics. Services are decoupled: they communicate only through Kafka topics, using event types defined once in `@ecommerce/shared`.

The project is a learning and demonstration platform. Payment and delivery are simulated; the focus is on messaging topology, failure handling and observability.

### Goals
- Show an asynchronous order lifecycle across independent services.
- Handle payment failure explicitly (retry, then dead-letter).
- Give users live order status without polling (SSE).
- Make the system observable (metrics, dashboards, Kafka and ES UIs).
- Start the whole stack with one command.

### Non-goals
- Real payment or courier integration.
- Multi-broker Kafka, high availability, authentication.
- Exactly-once delivery guarantees.

## 2. Architecture

```
React Frontend (80)
      │ REST + SSE
      ▼
Order Service ──(orders)──▶ Payment Service ──(payments)──▶ Delivery Service
      ▲                           │                               │
      │                     (orders.DLQ)              (order.status.updated)
      └───────────────────────────────────────────────────────────┘

orders / payments / order.status.updated / orders.DLQ ──▶ Search Service ──▶ Elasticsearch
orders / payments ──▶ Analytics Service ──▶ /stats + Prometheus gauges
All services ──▶ /metrics ──▶ Prometheus ──▶ Grafana
```

Monorepo (pnpm workspace): `apps/frontend`, `services/*`, `packages/shared`, `infrastructure/{prometheus,grafana}`.

## 3. Event contracts

Defined in `packages/shared/src/index.ts`; both producers and consumers import them, so a schema change breaks the build instead of production.

| Topic                  | Partitions | Event                    | Key       | Producer  | Consumers                   |
|------------------------|------------|--------------------------|-----------|-----------|-----------------------------|
| `orders`               | 3          | `OrderCreatedEvent`      | `userId`  | order     | payment, analytics, search  |
| `payments`             | 1          | `PaymentProcessedEvent`  | `orderId` | payment   | delivery, analytics, search |
| `order.status.updated` | 1          | `OrderStatusUpdatedEvent`| `orderId` | delivery  | order, search               |
| `orders.DLQ`           | 1          | `PaymentProcessedEvent`  | `orderId` | payment   | search                      |
| `order-stats`          | 1          | `OrderStatsEvent`        | -         | analytics | none                        |

Each service uses its own consumer group (`payment-service`, `delivery-service`, ...), so every service sees every message independently.

## 4. Services

### Order Service (NestJS, port 3001)
- REST API for creating and listing orders; persists to SQLite using prepared statements.
- On create: insert row as `PENDING`, emit an in-process event (for SSE), publish `OrderCreatedEvent` to `orders`.
- Consumes `order.status.updated` and applies status/courier to the row.
- Streams `order.created` and `order.status.updated` to the browser over SSE (RxJS `Subject`).

### Payment Service (Express + kafkajs, port 3002)
- Consumes `orders`. Each attempt waits 1-3 s and succeeds with probability 0.8.
- Up to 3 attempts. Success is published to `payments`; exhaustion is published to `orders.DLQ` with `failureReason`.
- Records `order_processing_duration_seconds`, `payment_success_total`, `payment_failure_total`.

### Delivery Service (Express + kafkajs, port 3003)
- Consumes `payments`; ignores `FAILED`.
- Assigns a random courier and publishes `PREPARING → SHIPPED → DELIVERED`, 5 s apart, to `order.status.updated`.

### Analytics Service (Express + kafkajs, port 3004)
- Consumes `orders` and `payments` into in-memory 60 s sliding windows.
- Computes orders/min, revenue, payment success rate and average order→payment latency; exposes them at `/stats` and as Prometheus gauges, refreshed on an interval.

### Search Service (Express + kafkajs + Elasticsearch, port 3005)
- Consumes all order-related topics and upserts one document per order into the `orders` index (keyword/date/nested mappings plus a `fullText` field).
- `GET /search` supports full-text query, status filter, date range, pagination and `<mark>` highlighting. Also `/search/orders/:id` and `/search/stats` (aggregations).

### Frontend (React + Vite, nginx)
Tabs: place order, live orders table (SSE), analytics charts (polls `/stats`), search.

## 5. Order lifecycle

```
POST /orders → PENDING
   └─ payment (≤3 attempts)
        ├─ SUCCESS → payments → PAID → PREPARING → SHIPPED → DELIVERED
        └─ FAILED  → orders.DLQ → payment_failed
```

## 6. Observability

Every service exposes `/health` and `/metrics` (default process metrics plus the counters above). Prometheus scrapes all services; Grafana is provisioned with a dashboard for Kafka throughput, payment success rate, p50/p95 processing time and orders per minute. Kafka UI (consumer lag, messages) and Kibana (index inspection) are included in Compose.

## 7. Key design decisions

| Decision | Rationale | Trade-off |
|----------|-----------|-----------|
| Kafka as the only inter-service channel | Loose coupling, replay, independent consumer groups | Eventual consistency; operational weight |
| Shared typed event package | Compile-time contract checking | Services must be built/versioned together in the monorepo |
| Retry in-process then DLQ | Simple, visible failure path | Retries block that handler and are lost on crash |
| SQLite in order service | Zero setup | Single instance only; not a production store |
| SSE rather than WebSocket | One-way push is all the UI needs; simple over HTTP | No client→server channel |
| Elasticsearch as a read model | Rich search and aggregation | Another datastore to keep in sync |
| `orders` keyed by `userId`, 3 partitions | Per-user ordering, parallelism | Per-order ordering across topics is not guaranteed |

## 8. Known limitations and planned improvements

1. **Delivery is not durable.** `deliver()` runs fire-and-forget with in-memory sleeps; a restart mid-delivery strands the order. Fix: persist a delivery state machine (`orderId`, `stage`, `nextRunAt`) and drive it from a poller, with conditional transitions (`UPDATE ... WHERE stage = $expected`) so duplicates are no-ops.
2. **Dual write in order service.** The DB insert and Kafka publish are separate, and the publish error is only logged, so an order can exist without an event. Fix: transactional outbox.
3. **Same pattern in payment.** Handlers are not awaited by the consumer, so offsets are committed before work completes (at-most-once). Fix: await the handler, or use a retry/delay topic, and make consumers idempotent on `(orderId, status)`.
4. **No runtime validation.** Messages are parsed with `JSON.parse` and cast. Fix: validate with zod using shared schemas; send invalid messages to a DLQ.
5. **Analytics memory growth.** `orderCreatedAt` is never pruned. Fix: delete on payment event and prune with the window. Windows are also lost on restart.
6. **Single-node infrastructure.** One broker, replication factor 1, auto-created topics. Fix: explicit topic provisioning and multi-broker setup for anything beyond a demo.
7. **Simulated external systems.** Payment outcome is random; delivery is a timer.

## 9. Running

```bash
docker compose up --build   # whole stack, UI on http://localhost
```

See the README for ports, metrics reference and local development.
