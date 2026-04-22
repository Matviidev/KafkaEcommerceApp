import dotenv from 'dotenv';
import { resolve } from 'node:path';
dotenv.config({ path: resolve(__dirname, '../../../.env') });

import express from 'express';
import { Kafka } from 'kafkajs';
import { Counter, collectDefaultMetrics, register } from 'prom-client';
import { TOPICS } from '@ecommerce/shared';
import type { PaymentProcessedEvent, OrderStatusUpdatedEvent } from '@ecommerce/shared';

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

const COURIERS = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank'];
const STAGES: OrderStatusUpdatedEvent['status'][] = ['PREPARING', 'SHIPPED', 'DELIVERED'];
const STAGE_DELAY = 5_000;

const app = express();
app.use(express.json());

const kafka = new Kafka({
  brokers: [process.env.KAFKA_BROKER ?? 'kafka:9092'],
  retry: { retries: 10 },
});
const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'delivery-service' });

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.send(await register.metrics());
});

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function deliver(event: PaymentProcessedEvent) {
  const courier = COURIERS[Math.floor(Math.random() * COURIERS.length)];
  console.log(`[delivery-service] starting delivery for ${event.orderId}, courier: ${courier}`);

  for (const status of STAGES) {
    await sleep(STAGE_DELAY);
    const update: OrderStatusUpdatedEvent = {
      orderId: event.orderId,
      status,
      courier,
      updatedAt: new Date().toISOString(),
    };
    await producer.send({
      topic: TOPICS.ORDER_STATUS_UPDATED,
      messages: [{ key: event.orderId, value: JSON.stringify(update) }],
    });
    produced.inc({ topic: TOPICS.ORDER_STATUS_UPDATED });
    console.log(`[delivery-service] order=${event.orderId} status=${status}`);
  }
}

async function main() {
  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic: TOPICS.PAYMENTS, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      consumed.inc({ topic: TOPICS.PAYMENTS });
      const event = JSON.parse(message.value?.toString() ?? '{}') as PaymentProcessedEvent;
      if (event.status === 'FAILED') {
        console.log(`[delivery-service] ignoring failed payment for order ${event.orderId}`);
        return;
      }
      deliver(event).catch(console.error);
    },
  });

  const port = process.env.DELIVERY_SERVICE_PORT ?? 3003;
  app.listen(port, () => console.log(`[delivery-service] listening on :${port}`));
}

main().catch(console.error);
