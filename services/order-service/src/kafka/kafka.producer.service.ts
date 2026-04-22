import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Kafka, Producer, Admin } from 'kafkajs';
import { Counter, collectDefaultMetrics } from 'prom-client';
import { TOPICS } from '@ecommerce/shared';

const produced = new Counter({
  name: 'kafka_messages_produced_total',
  help: 'Total Kafka messages produced',
  labelNames: ['topic'],
});

collectDefaultMetrics();

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private readonly kafka = new Kafka({
    brokers: [process.env.KAFKA_BROKER ?? 'kafka:9092'],
    retry: { retries: 10 },
  });
  private readonly producer: Producer = this.kafka.producer();
  private readonly admin: Admin = this.kafka.admin();

  async onModuleInit() {
    await this.admin.connect();
    await this.admin
      .createTopics({
        waitForLeaders: true,
        topics: [
          { topic: TOPICS.ORDERS, numPartitions: 3 },
          { topic: TOPICS.PAYMENTS, numPartitions: 1 },
          { topic: TOPICS.ORDER_STATUS_UPDATED, numPartitions: 1 },
          { topic: TOPICS.ORDERS_DLQ, numPartitions: 1 },
          { topic: TOPICS.ORDER_STATS, numPartitions: 1 },
        ],
      })
      .catch(() => {});
    await this.admin.disconnect();
    await this.producer.connect();
    this.logger.log('Kafka producer connected, topics ensured');
  }

  async onModuleDestroy() {
    await this.producer.disconnect();
  }

  async publish(topic: string, key: string, value: object): Promise<void> {
    await this.producer.send({
      topic,
      messages: [{ key, value: JSON.stringify(value) }],
    });
    produced.inc({ topic });
  }
}
