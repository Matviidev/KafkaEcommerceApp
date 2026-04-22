import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Kafka, Consumer } from 'kafkajs';
import { Counter } from 'prom-client';
import { TOPICS } from '@ecommerce/shared';
import type { OrderStatusUpdatedEvent } from '@ecommerce/shared';
import { OrdersService } from '../orders/orders.service';

const consumed = new Counter({
  name: 'kafka_messages_consumed_total',
  help: 'Total Kafka messages consumed',
  labelNames: ['topic'],
});

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private readonly kafka = new Kafka({
    brokers: [process.env.KAFKA_BROKER ?? 'kafka:9092'],
    retry: { retries: 10 },
  });
  private readonly consumer: Consumer = this.kafka.consumer({ groupId: 'order-service' });

  constructor(private readonly ordersService: OrdersService) {}

  async onModuleInit() {
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: TOPICS.ORDER_STATUS_UPDATED, fromBeginning: false });
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        consumed.inc({ topic: TOPICS.ORDER_STATUS_UPDATED });
        const event = JSON.parse(message.value?.toString() ?? '{}') as OrderStatusUpdatedEvent;
        try {
          this.ordersService.updateStatus(event.orderId, event.status, event.courier);
          this.logger.log(`Order ${event.orderId} → ${event.status}`);
        } catch {
          // order may not exist in this instance
        }
      },
    });
    this.logger.log('Kafka consumer listening on order.status.updated');
  }

  async onModuleDestroy() {
    await this.consumer.disconnect();
  }
}
