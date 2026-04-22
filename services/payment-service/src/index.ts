import dotenv from 'dotenv';
import { resolve } from 'node:path';
dotenv.config({ path: resolve(__dirname, '../../../.env') });

import express from 'express';
import { Kafka } from 'kafkajs';
import { v4 as uuid } from 'uuid';
import { Counter, Histogram, collectDefaultMetrics, register } from 'prom-client';
import { TOPICS } from '@ecommerce/shared';
import type { OrderCreatedEvent, PaymentProcessedEvent } from '@ecommerce/shared';

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
const paymentSuccess = new Counter({ name: 'payment_success_total', help: 'Successful payments' });
const paymentFailure = new Counter({ name: 'payment_failure_total', help: 'Failed payments' });
const processingDuration = new Histogram({
  name: 'order_processing_duration_seconds',
  help: 'Time from order.created to payment.processed',
  buckets: [0.5, 1, 2, 3, 5, 10],
});

const app = express();
app.use(express.json());

const kafka = new Kafka({
  brokers: [process.env.KAFKA_BROKER ?? 'kafka:9092'],
  retry: { retries: 10 },
});
const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'payment-service' });

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.send(await register.metrics());
});

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function tryPay(): Promise<'SUCCESS' | 'FAILED'> {
  await sleep(1000 + Math.random() * 2000);
  return Math.random() < 0.8 ? 'SUCCESS' : 'FAILED';
}

async function handleOrder(event: OrderCreatedEvent) {
  const startedAt = Date.now();
  const MAX = 3;
  let status: 'SUCCESS' | 'FAILED' = 'FAILED';

  for (let attempt = 1; attempt <= MAX; attempt++) {
    status = await tryPay();
    if (status === 'SUCCESS') break;
    if (attempt < MAX) console.log(`[payment-service] attempt ${attempt} failed for ${event.orderId}, retrying`);
  }

  const payment: PaymentProcessedEvent = {
    paymentId: uuid(),
    orderId: event.orderId,
    status,
    processedAt: new Date().toISOString(),
    failureReason: status === 'FAILED' ? 'Payment declined after 3 attempts' : null,
  };

  processingDuration.observe((Date.now() - startedAt) / 1000);

  if (status === 'SUCCESS') {
    await producer.send({
      topic: TOPICS.PAYMENTS,
      messages: [{ key: event.orderId, value: JSON.stringify(payment) }],
    });
    produced.inc({ topic: TOPICS.PAYMENTS });
    paymentSuccess.inc();
    console.log(`[payment-service] SUCCESS order=${event.orderId} payment=${payment.paymentId}`);
  } else {
    await producer.send({
      topic: TOPICS.ORDERS_DLQ,
      messages: [{ key: event.orderId, value: JSON.stringify(payment) }],
    });
    produced.inc({ topic: TOPICS.ORDERS_DLQ });
    paymentFailure.inc();
    console.log(`[payment-service] FAILED order=${event.orderId} → DLQ`);
  }
}

async function main() {
  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic: TOPICS.ORDERS, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      consumed.inc({ topic: TOPICS.ORDERS });
      const event = JSON.parse(message.value?.toString() ?? '{}') as OrderCreatedEvent;
      if (!event.orderId) return;
      console.log(`[payment-service] received order ${event.orderId}`);
      handleOrder(event).catch(console.error);
    },
  });

  const port = process.env.PAYMENT_SERVICE_PORT ?? 3002;
  app.listen(port, () => console.log(`[payment-service] listening on :${port}`));
}

main().catch(console.error);
