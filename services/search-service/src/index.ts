import dotenv from 'dotenv';
import { resolve } from 'node:path';
dotenv.config({ path: resolve(__dirname, '../../../.env') });

import express from 'express';
import { Kafka } from 'kafkajs';
import { Client } from '@elastic/elasticsearch';
import { Counter, collectDefaultMetrics, register } from 'prom-client';
import { TOPICS } from '@ecommerce/shared';
import type {
  OrderCreatedEvent,
  PaymentProcessedEvent,
  OrderStatusUpdatedEvent,
} from '@ecommerce/shared';

collectDefaultMetrics();

const consumed = new Counter({
  name: 'kafka_messages_consumed_total',
  help: 'Total Kafka messages consumed',
  labelNames: ['topic'],
});

const INDEX = 'orders';

const app = express();
app.use(express.json());

const kafka = new Kafka({
  brokers: [process.env.KAFKA_BROKER ?? 'kafka:9092'],
  retry: { retries: 10 },
});
const consumer = kafka.consumer({ groupId: 'search-service' });
const es = new Client({ node: process.env.ES_NODE ?? 'http://elasticsearch:9200' });

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.send(await register.metrics());
});

app.get('/search', async (req, res) => {
  try {
    const { q = '', status, from, to, page = '1', limit = '10' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));

    const must: object[] = [];

    if (q) {
      must.push({ multi_match: { query: q, fields: ['fullText', 'courier', 'orderId', 'userId'] } });
    }
    if (status) {
      must.push({ term: { status } });
    }
    if (from || to) {
      const range: Record<string, string> = {};
      if (from) range.gte = from;
      if (to) range.lte = to;
      must.push({ range: { createdAt: range } });
    }

    const result = await es.search({
      index: INDEX,
      from: (pageNum - 1) * limitNum,
      size: limitNum,
      query: must.length ? { bool: { must } } : { match_all: {} },
      highlight: q
        ? { fields: { fullText: {}, courier: {} }, pre_tags: ['<mark>'], post_tags: ['</mark>'] }
        : undefined,
      sort: [{ createdAt: { order: 'desc' } }],
    });

    const hits = result.hits.hits.map((h) => ({
      ...(h._source as object),
      _highlight: h.highlight,
    }));

    res.json({ total: (result.hits.total as { value: number }).value, page: pageNum, limit: limitNum, hits });
  } catch (err) {
    console.error('[search-service] search error', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

app.get('/search/orders/:id', async (req, res) => {
  try {
    const doc = await es.get({ index: INDEX, id: req.params.id });
    res.json(doc._source);
  } catch {
    res.status(404).json({ error: 'Not found' });
  }
});

app.get('/search/stats', async (req, res) => {
  try {
    const { userId } = req.query as Record<string, string>;
    const filter: object[] = userId ? [{ term: { userId } }] : [];

    const result = await es.search({
      index: INDEX,
      size: 0,
      query: filter.length ? { bool: { filter } } : { match_all: {} },
      aggs: {
        total_revenue: { sum: { field: 'totalAmount' } },
        by_status: { terms: { field: 'status' } },
      },
    });

    res.json({
      totalOrders: (result.hits.total as { value: number }).value,
      totalRevenue: (result.aggregations?.total_revenue as { value: number })?.value ?? 0,
      byStatus: (result.aggregations?.by_status as { buckets: object[] })?.buckets ?? [],
    });
  } catch (err) {
    console.error('[search-service] stats error', err);
    res.status(500).json({ error: 'Stats failed' });
  }
});

async function ensureIndex() {
  const exists = await es.indices.exists({ index: INDEX });
  if (!exists) {
    await es.indices.create({
      index: INDEX,
      mappings: {
        properties: {
          orderId: { type: 'keyword' },
          userId: { type: 'keyword' },
          status: { type: 'keyword' },
          totalAmount: { type: 'float' },
          items: {
            type: 'nested',
            properties: {
              productId: { type: 'keyword' },
              quantity: { type: 'integer' },
              price: { type: 'float' },
            },
          },
          courier: { type: 'text' },
          paymentStatus: { type: 'keyword' },
          createdAt: { type: 'date' },
          updatedAt: { type: 'date' },
          processedAt: { type: 'date' },
          fullText: { type: 'text' },
        },
      },
    });
    console.log('[search-service] index created');
  }
}

async function upsert(id: string, doc: object) {
  await es.update({
    index: INDEX,
    id,
    body: { doc, doc_as_upsert: true },
  });
}

async function main() {
  await new Promise<void>((resolve) => {
    const t = setInterval(async () => {
      try {
        await es.ping();
        clearInterval(t);
        resolve();
      } catch {
        console.log('[search-service] waiting for Elasticsearch...');
      }
    }, 3000);
  });

  await ensureIndex();

  await consumer.connect();
  await consumer.subscribe({
    topics: [TOPICS.ORDERS, TOPICS.ORDER_STATUS_UPDATED, TOPICS.PAYMENTS, TOPICS.ORDERS_DLQ],
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      consumed.inc({ topic });
      const event = JSON.parse(message.value?.toString() ?? '{}');

      try {
        if (topic === TOPICS.ORDERS) {
          const e = event as OrderCreatedEvent;
          await upsert(e.orderId, {
            orderId: e.orderId,
            userId: e.userId,
            items: e.items,
            totalAmount: e.totalAmount,
            status: 'PENDING',
            createdAt: e.createdAt,
            updatedAt: e.createdAt,
            fullText: `${e.orderId} ${e.userId} ${e.items.map((i) => i.productId).join(' ')}`,
          });
        } else if (topic === TOPICS.ORDER_STATUS_UPDATED) {
          const e = event as OrderStatusUpdatedEvent;
          await upsert(e.orderId, { status: e.status, courier: e.courier, updatedAt: e.updatedAt });
        } else if (topic === TOPICS.PAYMENTS) {
          const e = event as PaymentProcessedEvent;
          await upsert(e.orderId, {
            paymentStatus: e.status,
            processedAt: e.processedAt,
            ...(e.status === 'SUCCESS' ? { status: 'PAID' } : {}),
          });
        } else if (topic === TOPICS.ORDERS_DLQ) {
          const e = event as PaymentProcessedEvent;
          await upsert(e.orderId, { status: 'payment_failed', paymentStatus: 'FAILED', processedAt: e.processedAt });
        }

        console.log(`[search-service] indexed ${event.orderId} from ${topic}`);
      } catch (err) {
        console.error('[search-service] upsert error', err);
      }
    },
  });

  const port = process.env.SEARCH_SERVICE_PORT ?? 3005;
  app.listen(port, () => console.log(`[search-service] listening on :${port}`));
}

main().catch(console.error);
