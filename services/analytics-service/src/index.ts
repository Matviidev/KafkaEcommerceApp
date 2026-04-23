import dotenv from 'dotenv';
import { resolve } from 'node:path';
dotenv.config({ path: resolve(__dirname, '../../../.env') });

import express from 'express';
import { Kafka } from 'kafkajs';
import { Counter, Gauge, collectDefaultMetrics, register } from 'prom-client';
import { TOPICS } from '@ecommerce/shared';
import type { OrderCreatedEvent, PaymentProcessedEvent, OrderStatsEvent } from '@ecommerce/shared';

collectDefaultMetrics();

const consumed = new Counter({
  name: 'kafka_messages_consumed_total',
  help: 'Total Kafka messages consumed',
  labelNames: ['topic'],
});
const produced = new Counter({
  name: 'kafka_messages_produced_total',
  help: 'Total Kafka messages produced',
  labelNames: ['topic'],
});
const gaugeOrders = new Gauge({ name: 'analytics_orders_per_minute', help: 'Orders in last 60s' });
const gaugeRevenue = new Gauge({ name: 'analytics_total_revenue', help: 'Revenue in last 60s' });
const gaugeSuccessRate = new Gauge({ name: 'analytics_payment_success_rate', help: 'Payment success rate' });
const gaugeAvgMs = new Gauge({ name: 'analytics_avg_processing_ms', help: 'Avg order processing ms' });

interface OrderEntry {
  ts: number;
  amount: number;
}

interface PaymentEntry {
  ts: number;
  status: 'SUCCESS' | 'FAILED';
  orderId: string;
}

const orderWindow: OrderEntry[] = [];
const paymentWindow: PaymentEntry[] = [];
const orderCreatedAt: Map<string, number> = new Map();

const WINDOW_MS = 60_000;

function prune() {
  const cutoff = Date.now() - WINDOW_MS;
  while (orderWindow.length && orderWindow[0].ts < cutoff) orderWindow.shift();
  while (paymentWindow.length && paymentWindow[0].ts < cutoff) paymentWindow.shift();
}

function computeStats(): OrderStatsEvent {
  prune();
  const ordersCount = orderWindow.length;
  const totalRevenue = orderWindow.reduce((s, e) => s + e.amount, 0);
  const successCount = paymentWindow.filter((p) => p.status === 'SUCCESS').length;
  const successRate = paymentWindow.length ? successCount / paymentWindow.length : 0;

  let totalMs = 0;
  let processed = 0;
  for (const p of paymentWindow) {
    const created = orderCreatedAt.get(p.orderId);
    if (created) { totalMs += p.ts - created; processed++; }
  }
  const avgProcessingMs = processed ? Math.round(totalMs / processed) : 0;

  return {
    windowStart: new Date(Date.now() - WINDOW_MS).toISOString(),
    ordersCount,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    successRate: Math.round(successRate * 100) / 100,
    avgProcessingMs,
  };
}

const app = express();
app.use(express.json());

let latestStats: OrderStatsEvent = computeStats();

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.send(await register.metrics());
});
app.get('/stats', (_req, res) => res.json(latestStats));

const kafka = new Kafka({
  brokers: [process.env.KAFKA_BROKER ?? 'kafka:9092'],
  retry: { retries: 10 },
});
const consumer = kafka.consumer({ groupId: 'analytics-service' });
const producer = kafka.producer();

async function main() {
  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topics: [TOPICS.ORDERS, TOPICS.PAYMENTS], fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      consumed.inc({ topic });
      const event = JSON.parse(message.value?.toString() ?? '{}');

      if (topic === TOPICS.ORDERS) {
        const e = event as OrderCreatedEvent;
        orderWindow.push({ ts: Date.now(), amount: e.totalAmount });
        orderCreatedAt.set(e.orderId, Date.now());
      } else if (topic === TOPICS.PAYMENTS) {
        const e = event as PaymentProcessedEvent;
        paymentWindow.push({ ts: Date.now(), status: e.status, orderId: e.orderId });
      }
    },
  });

  setInterval(async () => {
    latestStats = computeStats();
    gaugeOrders.set(latestStats.ordersCount);
    gaugeRevenue.set(latestStats.totalRevenue);
    gaugeSuccessRate.set(latestStats.successRate);
    gaugeAvgMs.set(latestStats.avgProcessingMs);

    await producer
      .send({
        topic: TOPICS.ORDER_STATS,
        messages: [{ value: JSON.stringify(latestStats) }],
      })
      .catch(console.error);
    produced.inc({ topic: TOPICS.ORDER_STATS });
    console.log('[analytics-service] stats published:', latestStats);
  }, 10_000);

  const port = process.env.ANALYTICS_SERVICE_PORT ?? 3004;
  app.listen(port, () => console.log(`[analytics-service] listening on :${port}`));
}

main().catch(console.error);
